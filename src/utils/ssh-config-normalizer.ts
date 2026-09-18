import path from "path";
import os from "os";
import { SSHConfig } from "../models/types.js";

/**
 * Shared normalization for SSH configs coming from untrusted sources
 * (CLI flags, JSON config files, tool-call parameters).
 *
 * Every path that turns raw input into an SSHConfig must go through here so
 * that configured connections and ad-hoc connections behave identically.
 */

const DEFAULT_TRANSPORT_MODE: SSHConfig["transportMode"] = "exec";
const DEFAULT_SHELL_READY_TIMEOUT_MS = 10000;

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return Boolean(value);
}

function parseTransportMode(
  value: unknown,
): SSHConfig["transportMode"] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "exec" || value === "shell") {
    return value;
  }

  throw new Error(
    `transportMode must be either 'exec' or 'shell', got: ${String(value)}`,
  );
}

function parseTimeout(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed =
    typeof value === "number" ? value : parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive number, got: ${String(value)}`);
  }

  return parsed;
}

function parseMaxOutputBytes(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(String(value));

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(
      `maxOutputBytes must be a non-negative integer, got: ${String(value)}`,
    );
  }

  return parsed;
}

function parseCommandTemplate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const template = String(value);
  if (!template.includes("<command>") && !template.includes("<quotedCommand>")) {
    throw new Error(
      `commandTemplate must contain '<command>' or '<quotedCommand>' placeholder, got: ${template}`,
    );
  }

  return template;
}

function expandHomePath(localPath: string): string {
  if (localPath === "~") {
    return os.homedir();
  }
  if (localPath.startsWith("~/")) {
    return path.join(os.homedir(), localPath.slice(2));
  }
  return localPath;
}

function normalizeLocalPath(localPath: string): string {
  return path.resolve(expandHomePath(localPath));
}

function normalizeRemotePath(remotePath: string): string {
  if (!remotePath) {
    return "";
  }
  if (!path.posix.isAbsolute(remotePath)) {
    throw new Error(
      `allowedRemotePaths entries must be absolute POSIX paths, got: ${remotePath}`,
    );
  }
  const normalized = path.posix.normalize(remotePath);
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Normalize an SSH config object to ensure proper types and structure
 */
export function normalizeSshConfig(config: any): SSHConfig {
  const port = typeof config.port === "number"
    ? config.port
    : parseInt(config.port, 10);

  if (isNaN(port)) {
    throw new Error(`Port must be a valid number, got: ${config.port}`);
  }

  return {
    name: config.name,
    host: config.host,
    port,
    username: config.username || config.user,
    password: config.password,
    privateKey: config.privateKey
      ? normalizeLocalPath(String(config.privateKey))
      : undefined,
    passphrase: config.passphrase || process.env.SSH_MCP_PASSPHRASE,
    agent: config.agent,
    algorithms: config.algorithms,
    proxy: config.proxy,
    socksProxy: config.socksProxy,
    pty: parseBoolean(config.pty),
    tryKeyboard: parseBoolean(config.tryKeyboard),
    transportMode:
      parseTransportMode(config.transportMode) ||
      DEFAULT_TRANSPORT_MODE,
    shellReadyTimeoutMs:
      parseTimeout(
        config.shellReadyTimeoutMs,
        "shellReadyTimeoutMs",
      ) || DEFAULT_SHELL_READY_TIMEOUT_MS,
    shellCommandTimeoutMs: parseTimeout(
      config.shellCommandTimeoutMs,
      "shellCommandTimeoutMs",
    ),
    connectionTimeoutMs: parseTimeout(
      config.connectionTimeoutMs,
      "connectionTimeoutMs",
    ),
    sftpTimeoutMs: parseTimeout(config.sftpTimeoutMs, "sftpTimeoutMs"),
    maxOutputBytes: parseMaxOutputBytes(config.maxOutputBytes),
    keepaliveIntervalMs: parseTimeout(
      config.keepaliveIntervalMs,
      "keepaliveIntervalMs",
    ),
    keepaliveCountMax: parseTimeout(
      config.keepaliveCountMax,
      "keepaliveCountMax",
    ),
    commandWhitelist: Array.isArray(config.commandWhitelist)
      ? config.commandWhitelist
      : config.whitelist
      ? typeof config.whitelist === "string"
        ? config.whitelist.split("|").map((s: string) => s.trim()).filter(Boolean)
        : config.whitelist
      : undefined,
    commandBlacklist: Array.isArray(config.commandBlacklist)
      ? config.commandBlacklist
      : config.blacklist
      ? typeof config.blacklist === "string"
        ? config.blacklist.split("|").map((s: string) => s.trim()).filter(Boolean)
        : config.blacklist
      : undefined,
    allowedLocalPaths: Array.isArray(config.allowedLocalPaths)
      ? config.allowedLocalPaths
          .map((allowedPath: unknown) =>
            normalizeLocalPath(String(allowedPath)),
          )
          .filter(Boolean)
      : typeof config.allowedLocalPaths === "string"
        ? config.allowedLocalPaths
            .split("|")
            .map((allowedPath: string) =>
              normalizeLocalPath(allowedPath.trim()),
            )
            .filter(Boolean)
        : undefined,
    allowedRemotePaths: Array.isArray(config.allowedRemotePaths)
      ? config.allowedRemotePaths
          .map((allowedPath: unknown) =>
            normalizeRemotePath(String(allowedPath)),
          )
      : typeof config.allowedRemotePaths === "string"
        ? config.allowedRemotePaths
            .split("|")
            .map((allowedPath: string) =>
              normalizeRemotePath(allowedPath.trim()),
            )
            .filter(Boolean)
        : undefined,
    commandTemplate: parseCommandTemplate(config.commandTemplate),
  };
}
