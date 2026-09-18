import { parseArgs } from "node:util";
import { SSHConfig, SshConnectionConfigMap, ParsedArgs, AdhocPolicy } from "../models/types.js";
import fs from "fs";
import path from "path";
import { lookupSshConfig } from "../utils/ssh-config-parser.js";
import { normalizeSshConfig } from "../utils/ssh-config-normalizer.js";

const ADHOC_TEMPLATE_NAME = "adhoc-defaults";

/** Flags declared as `type: "boolean"` in parseArgs */
const BOOLEAN_OPTIONS = [
  "--allow-adhoc-hosts",
  "--adhoc-allow-password-auth",
  "--pty",
  "--try-keyboard",
];

function splitCommaList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function parseAdhocTransportMode(
  value: unknown,
): SSHConfig["transportMode"] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "exec" || value === "shell") {
    return value;
  }

  throw new Error(
    `--adhoc-transport-mode must be either 'exec' or 'shell', got: ${String(value)}`,
  );
}

/**
 * Command line argument parser class
 */
export class CommandLineParser {
  /**
   * Boolean flags accept no value: `--flag false` would silently enable the
   * flag and leak the literal "false" into the positional host slot.
   * @private
   */
  private static assertNoBooleanValue(rawArgs: string[]): void {
    for (let index = 0; index < rawArgs.length; index += 1) {
      if (!BOOLEAN_OPTIONS.includes(rawArgs[index])) {
        continue;
      }

      const next = rawArgs[index + 1];
      if (next !== undefined && /^(true|false)$/i.test(next)) {
        throw new Error(
          `${rawArgs[index]} is a boolean flag and does not take a value: write ${rawArgs[index]} to enable it, or omit it to disable it (got '${next}').`,
        );
      }
    }
  }

  /**
   * Parse command line arguments
   */
  public static parseArgs(): ParsedArgs {
    const rawArgs = process.argv.slice(2);
    this.assertNoBooleanValue(rawArgs);

    const { values, positionals } = parseArgs({
      args: rawArgs,
      options: {
        "config-file": { type: "string" },
        "ssh-config-file": { type: "string" },
        ssh: { type: "string", multiple: true },
        // Compatible with single connection legacy parameters
        host: { type: "string", short: "h" },
        port: { type: "string", short: "p" },
        username: { type: "string", short: "u" },
        password: { type: "string", short: "w" },
        privateKey: { type: "string", short: "k" },
        passphrase: { type: "string", short: "P" },
        agent: { type: "string", short: "a" },
        whitelist: { type: "string", short: "W" },
        blacklist: { type: "string", short: "B" },
        proxy: { type: "string" },
        socksProxy: { type: "string", short: "s" },
        "allowed-local-paths": { type: "string" },
        "allowed-remote-paths": { type: "string" },
        "transport-mode": { type: "string" },
        "shell-ready-timeout": { type: "string" },
        "command-template": { type: "string" },
        "allow-adhoc-hosts": { type: "boolean" },
        "adhoc-host-patterns": { type: "string" },
        "adhoc-allow-password-auth": { type: "boolean" },
        "adhoc-transport-mode": { type: "string" },
        pty: { type: "boolean" },
        "try-keyboard": { type: "boolean" },
      },
      allowPositionals: true,
    });

    const configMap: SshConnectionConfigMap = {};

    // Priority 1: Load from config file if specified
    if (values["config-file"]) {
      const configFilePath = path.resolve(values["config-file"]);
      if (!fs.existsSync(configFilePath)) {
        throw new Error(`Config file not found: ${configFilePath}`);
      }
      try {
        const configContent = fs.readFileSync(configFilePath, "utf-8");
        const fileConfig = JSON.parse(configContent);
        
        // Support both array format and object format
        if (Array.isArray(fileConfig)) {
          // Array format: [{name: "dev", host: "...", ...}, ...]
          for (const config of fileConfig) {
            if (!config.name || !config.host || !config.port || !config.username) {
              throw new Error("Each config in array must include name, host, port, username");
            }
            configMap[config.name] = normalizeSshConfig(config);
          }
        } else if (typeof fileConfig === "object" && fileConfig !== null) {
          // Object format: {"dev": {host: "...", ...}, "prod": {...}}
          for (const [name, config] of Object.entries(fileConfig)) {
            const normalizedConfig = normalizeSshConfig(config as any);
            normalizedConfig.name = name;
            configMap[name] = normalizedConfig;
          }
        } else {
          throw new Error("Config file must contain an array or object of SSH configurations");
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw new Error(`Invalid JSON in config file: ${(err as Error).message}`);
        }
        throw err;
      }
    }

    // Priority 2: Parse --ssh parameters (only if no config file was loaded)
    if (Object.keys(configMap).length === 0) {
      const sshParams: string[] = Array.isArray(values.ssh)
        ? values.ssh
        : values.ssh
        ? [values.ssh]
        : [];

      for (const sshStr of sshParams) {
        let conf: SSHConfig;
        
        // Try to parse as JSON first
        if (sshStr.trim().startsWith("{")) {
          try {
            const jsonConfig = JSON.parse(sshStr);
            conf = normalizeSshConfig(jsonConfig);
            if (!conf.name) {
              throw new Error("JSON config must include 'name' field");
            }
          } catch (err) {
            throw new Error(`Invalid JSON format in --ssh parameter: ${(err as Error).message}`);
          }
        } else {
          // Fallback to legacy comma-separated format for backward compatibility
          conf = this.parseLegacySshFormat(sshStr);
        }
        
        if (!conf.name || !conf.host || !conf.port || !conf.username) {
          throw new Error("Each --ssh must include name, host, port, username");
        }
        configMap[conf.name] = conf;
      }
    }

    // Priority 3: Compatible with single connection legacy parameters
    const host = values.host || positionals[0];

    // 尝试从 SSH config 读取配置
    let sshConfigEntry = null;
    if (host) {
      sshConfigEntry = lookupSshConfig(host, values["ssh-config-file"]);
    }

    const portStr = values.port || positionals[1] || sshConfigEntry?.port?.toString() || "22";
    const username = values.username || positionals[2] || sshConfigEntry?.user;
    const password = values.password || positionals[3];
    const privateKey = values.privateKey || sshConfigEntry?.identityFile;
    const passphrase = values.passphrase || process.env.SSH_MCP_PASSPHRASE;
    const resolvedAgent = values.agent !== undefined
      ? values.agent
      : !password && !privateKey
      ? process.env.SSH_AUTH_SOCK
      : undefined;
    // 命令行上是逗号分隔，配置文件里是 | 分隔，统一转成数组再交给归一化
    const whitelist = splitCommaList(values.whitelist);
    const blacklist = splitCommaList(values.blacklist);
    const allowedLocalPaths = splitCommaList(values["allowed-local-paths"]);
    const allowedRemotePaths = splitCommaList(values["allowed-remote-paths"]);
    const commandTemplate = values["command-template"];
    const pty = values.pty;
    const tryKeyboard = values["try-keyboard"];

    // 实际连接地址：优先使用 SSH config 的 HostName
    const actualHost = sshConfigEntry?.hostName || host;

    const adhocPolicy = this.parseAdhocPolicy(values);
    const adhocEnabled = adhocPolicy !== undefined;

    if (adhocPolicy) {
      // 显式 flag 构成 ad-hoc 继承模板；位置参数与默认主机的 SSH config 取值
      // 都是该主机专属的，不能外溢到其它主机
      const templateAgent = values.agent !== undefined
        ? values.agent
        : !values.password && !values.privateKey
        ? process.env.SSH_AUTH_SOCK
        : undefined;

      adhocPolicy.defaults = normalizeSshConfig({
        name: ADHOC_TEMPLATE_NAME,
        host: "",
        port: values.port || 22,
        username: values.username,
        password: values.password,
        privateKey: values.privateKey,
        passphrase,
        agent: templateAgent,
        proxy: values.proxy,
        socksProxy: values.socksProxy,
        pty,
        tryKeyboard,
        transportMode: adhocPolicy.transportMode || values["transport-mode"],
        shellReadyTimeoutMs: values["shell-ready-timeout"],
        commandTemplate,
        commandWhitelist: whitelist,
        commandBlacklist: blacklist,
        allowedLocalPaths,
        allowedRemotePaths,
      });
    }

    if (Object.keys(configMap).length === 0 && actualHost) {
      if (
        !portStr ||
        !username ||
        (!password && !privateKey && !resolvedAgent)
      ) {
        throw new Error(
          "Missing required parameters, need to provide host, port, username and password, private key or agent" +
            (adhocEnabled
              ? " (or drop --host and let tool calls pass a host, resolved from SSH config)"
              : ""),
        );
      }

      const port = parseInt(portStr, 10);
      if (isNaN(port)) {
        throw new Error("Port must be a valid number");
      }

      configMap["default"] = normalizeSshConfig({
        name: "default",
        host: actualHost,
        port,
        username,
        password,
        privateKey,
        passphrase,
        agent: resolvedAgent,
        proxy: values.proxy,
        socksProxy: values.socksProxy,
        pty: pty !== undefined ? pty : undefined,
        tryKeyboard: tryKeyboard !== undefined ? tryKeyboard : undefined,
        transportMode: values["transport-mode"],
        shellReadyTimeoutMs: values["shell-ready-timeout"],
        commandTemplate,
        commandWhitelist: whitelist,
        commandBlacklist: blacklist,
        allowedLocalPaths,
        allowedRemotePaths,
      });
    }

    // 无默认主机且未开启 ad-hoc 时，连接参数无从谈起
    if (Object.keys(configMap).length === 0 && !adhocEnabled) {
      throw new Error(
        "Missing required parameters, need to provide host, port, username and password, private key or agent",
      );
    }

    return {
      configs: configMap,
      adhoc: adhocPolicy,
    };
  }

  /**
   * 解析 ad-hoc 主机策略（未开启时返回 undefined）
   * @private
   */
  private static parseAdhocPolicy(values: {
    "allow-adhoc-hosts"?: boolean;
    "adhoc-host-patterns"?: string;
    "adhoc-allow-password-auth"?: boolean;
    "adhoc-transport-mode"?: string;
    "ssh-config-file"?: string;
  }): AdhocPolicy | undefined {
    const patternsRaw = values["adhoc-host-patterns"];
    const passwordAuthRaw = values["adhoc-allow-password-auth"];
    const transportModeRaw = values["adhoc-transport-mode"];

    if (values["allow-adhoc-hosts"] !== true) {
      const strayFlag = patternsRaw !== undefined
        ? "--adhoc-host-patterns"
        : passwordAuthRaw !== undefined
        ? "--adhoc-allow-password-auth"
        : transportModeRaw !== undefined
        ? "--adhoc-transport-mode"
        : undefined;

      if (strayFlag) {
        throw new Error(`${strayFlag} requires --allow-adhoc-hosts`);
      }
      return undefined;
    }

    const hostPatterns = patternsRaw
      ? patternsRaw
          .split(",")
          .map((pattern) => pattern.trim())
          .filter(Boolean)
      : [];

    const transportMode = parseAdhocTransportMode(transportModeRaw);

    return {
      enabled: true,
      hostPatterns: hostPatterns.length > 0 ? hostPatterns : undefined,
      sshConfigFile: values["ssh-config-file"],
      allowPasswordAuth: passwordAuthRaw === true,
      transportMode,
    };
  }

  /**
   * Parse legacy comma-separated format: name=dev,host=1.2.3.4,port=22,user=alice,password=xxx
   * @private
   */
  private static parseLegacySshFormat(sshStr: string): SSHConfig {
    const conf: any = {};
    const parts = sshStr.split(",");
    
    for (const part of parts) {
      // Only split on the first '=' to handle values containing '='
      const equalIndex = part.indexOf("=");
      if (equalIndex > 0) {
        const k = part.substring(0, equalIndex).trim();
        const v = part.substring(equalIndex + 1).trim();
        if (k && v) {
          conf[k] = v;
        }
      }
    }
    
    const port = parseInt(conf.port, 10);
    if (isNaN(port)) {
      throw new Error(
        `Port for connection ${conf.name || "unknown"} must be a valid number`
      );
    }
    
    return normalizeSshConfig(conf);
  }

  /**
   * Normalize SSH config object to ensure proper types and structure
   * @private
   */
}
