import { AdhocPolicy, SSHConfig } from "../models/types.js";
import { hostPatternMatches, lookupSshConfig } from "../utils/ssh-config-parser.js";
import { normalizeSshConfig } from "../utils/ssh-config-normalizer.js";
import { ToolError } from "../utils/tool-error.js";

/**
 * Ad-hoc target resolution.
 *
 * Turns a `host` (plus optional port/username) supplied in a tool call into a
 * full SSHConfig, without ever accepting key material or passwords as tool
 * parameters: credentials come from ~/.ssh/config, then from the startup
 * template, and password auth is opt-in via `--adhoc-allow-password-auth`.
 */

export const ADHOC_KEY_PREFIX = "adhoc:";

/** Target requested by a tool call */
export interface AdhocTargetRequest {
  host: string;
  port?: number;
  username?: string;
}

export interface AdhocResolution {
  /** Connection key registered in the manager */
  key: string;
  /** Resolved configuration, keyed by `key` */
  config: SSHConfig;
  /** Requested alias/host, as passed by the caller */
  requestedHost: string;
}

export function isAdhocKey(key: string): boolean {
  return key.startsWith(ADHOC_KEY_PREFIX);
}

/**
 * Connection key for an ad-hoc target, built from the *requested* host so it
 * stays stable and readable in list-servers even if ~/.ssh/config changes.
 */
export function buildAdhocKey(
  requestedHost: string,
  port: number,
  username: string,
): string {
  return `${ADHOC_KEY_PREFIX}${requestedHost.toLowerCase()}:${port}:${username}`;
}

export interface AdhocKeyParts {
  requestedHost: string;
  port: number;
  username: string;
}

/** Inverse of buildAdhocKey, for display purposes */
export function parseAdhocKey(key: string): AdhocKeyParts | null {
  if (!isAdhocKey(key)) {
    return null;
  }

  const segments = key.slice(ADHOC_KEY_PREFIX.length).split(":");
  if (segments.length < 3) {
    return null;
  }

  const username = segments.pop() as string;
  const port = Number(segments.pop());
  const requestedHost = segments.join(":");

  if (!requestedHost || !username || !Number.isInteger(port)) {
    return null;
  }

  return { requestedHost, port, username };
}

/**
 * Match a host against ad-hoc host patterns.
 *
 * Patterns use ssh-config glob syntax (`*`, `?`), are anchored and
 * case-insensitive, and support `!` negation. An empty pattern list allows any
 * host.
 */
export function isHostAllowed(host: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return true;
  }

  const target = host.toLowerCase();
  let matchedPositive = false;
  let hasPositivePattern = false;

  for (const pattern of patterns) {
    const isNegated = pattern.startsWith("!");
    const body = (isNegated ? pattern.slice(1) : pattern).toLowerCase();

    if (!body) {
      continue;
    }

    if (!isNegated) {
      hasPositivePattern = true;
    }

    if (!hostPatternMatches(target, body)) {
      continue;
    }

    if (isNegated) {
      return false;
    }

    matchedPositive = true;
  }

  // 只给了否定模式时，未被否定即放行
  return matchedPositive || !hasPositivePattern;
}

/**
 * Resolve a tool-call target into a connection key and configuration.
 *
 * Field precedence: explicit tool parameters > ~/.ssh/config > startup template.
 * @throws ToolError ADHOC_HOST_NOT_ALLOWED | ADHOC_TARGET_INVALID | SSH_AUTHENTICATION_MISSING
 */
export function resolveAdhocTarget(
  request: AdhocTargetRequest,
  base: Partial<SSHConfig> | undefined,
  policy: AdhocPolicy,
): AdhocResolution {
  const requestedHost = assertHostShape(request.host);

  let sshEntry;
  try {
    sshEntry = lookupSshConfig(requestedHost, policy.sshConfigFile);
  } catch (error) {
    throw new ToolError(
      "ADHOC_TARGET_INVALID",
      `Failed to read the SSH config used to resolve '${requestedHost}': ${
        (error as Error).message
      }`,
      false,
    );
  }

  // 实际连接地址：允许名单必须匹配解析后的地址，否则别名可以绕过主机限制
  const destination = sshEntry?.hostName || requestedHost;

  if (!isHostAllowed(destination, policy.hostPatterns)) {
    throw new ToolError(
      "ADHOC_HOST_NOT_ALLOWED",
      `Host '${requestedHost}' resolves to '${destination}', which is not allowed by --adhoc-host-patterns.`,
      false,
    );
  }

  const port = request.port ?? sshEntry?.port ?? base?.port ?? 22;
  assertPort(port, destination);

  const username = request.username ?? sshEntry?.user ?? base?.username;
  assertUsername(username, destination);

  // 密码与键盘交互认证默认不随 ad-hoc 主机继承：密码会被发送到调用方指定的
  // 任意主机，且 keyboard-interactive 会把密码重放给服务端控制的提示
  const allowPasswordAuth = policy.allowPasswordAuth === true;
  const password = allowPasswordAuth ? base?.password : undefined;
  const tryKeyboard = allowPasswordAuth ? base?.tryKeyboard : undefined;
  const privateKey = sshEntry?.identityFile || base?.privateKey;
  const agent = base?.agent;

  if (!password && !tryKeyboard && !privateKey && !agent) {
    throw new ToolError(
      "SSH_AUTHENTICATION_MISSING",
      base?.password && !allowPasswordAuth
        ? `No usable credentials for ad-hoc host '${destination}': the configured password is not inherited by ad-hoc hosts. Use key or agent authentication, or start the server with --adhoc-allow-password-auth.`
        : `No usable credentials for ad-hoc host '${destination}': add User/IdentityFile to ~/.ssh/config, or start the server with --privateKey/--agent.`,
      false,
    );
  }

  const key = buildAdhocKey(requestedHost, port, username);

  return {
    key,
    requestedHost,
    config: normalizeSshConfig({
      name: key,
      host: destination,
      port,
      username,
      password,
      privateKey,
      passphrase: base?.passphrase,
      agent,
      algorithms: base?.algorithms,
      proxy: base?.proxy,
      socksProxy: base?.socksProxy,
      pty: base?.pty,
      tryKeyboard,
      transportMode: policy.transportMode || base?.transportMode,
      shellReadyTimeoutMs: base?.shellReadyTimeoutMs,
      shellCommandTimeoutMs: base?.shellCommandTimeoutMs,
      connectionTimeoutMs: base?.connectionTimeoutMs,
      sftpTimeoutMs: base?.sftpTimeoutMs,
      maxOutputBytes: base?.maxOutputBytes,
      keepaliveIntervalMs: base?.keepaliveIntervalMs,
      keepaliveCountMax: base?.keepaliveCountMax,
      commandWhitelist: base?.commandWhitelist,
      commandBlacklist: base?.commandBlacklist,
      allowedLocalPaths: base?.allowedLocalPaths,
      allowedRemotePaths: base?.allowedRemotePaths,
      commandTemplate: base?.commandTemplate,
    }),
  };
}

function assertHostShape(host: unknown): string {
  if (typeof host !== "string" || host.trim().length === 0) {
    throw new ToolError(
      "ADHOC_TARGET_INVALID",
      "The 'host' parameter must be a non-empty hostname or ~/.ssh/config alias.",
      false,
    );
  }

  const trimmed = host.trim();

  if (/\s/.test(trimmed)) {
    throw new ToolError(
      "ADHOC_TARGET_INVALID",
      `Invalid host '${trimmed}': whitespace is not allowed.`,
      false,
    );
  }

  if (trimmed.includes("@") || trimmed.includes("/")) {
    throw new ToolError(
      "ADHOC_TARGET_INVALID",
      `Invalid host '${trimmed}': pass the hostname only, and use the 'username' parameter for the user.`,
      false,
    );
  }

  // host:port 是最常见的误用（IPv6 字面量除外）
  if (/^[^:]+:\d+$/.test(trimmed)) {
    throw new ToolError(
      "ADHOC_TARGET_INVALID",
      `Invalid host '${trimmed}': use the 'port' parameter instead of appending a port.`,
      false,
    );
  }

  return trimmed;
}

function assertPort(port: unknown, destination: string): asserts port is number {
  if (
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    throw new ToolError(
      "ADHOC_TARGET_INVALID",
      `Invalid port for ad-hoc host '${destination}': must be an integer between 1 and 65535.`,
      false,
    );
  }
}

function assertUsername(
  username: unknown,
  destination: string,
): asserts username is string {
  if (typeof username !== "string" || username.trim().length === 0) {
    throw new ToolError(
      "ADHOC_TARGET_INVALID",
      `No username for ad-hoc host '${destination}': add a User entry to ~/.ssh/config, pass --username at startup, or set the 'username' parameter.`,
      false,
    );
  }

  if (/[\s@:]/.test(username)) {
    throw new ToolError(
      "ADHOC_TARGET_INVALID",
      `Invalid username '${username}' for ad-hoc host '${destination}'.`,
      false,
    );
  }
}
