import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSHConnectionManager } from "../services/ssh-connection-manager.js";
import { isHostAllowed, parseAdhocKey } from "../services/adhoc-resolver.js";
import { listSshConfigHosts } from "../utils/ssh-config-parser.js";

type ServerInfo = ReturnType<SSHConnectionManager["getAllServerInfos"]>[number];

/** Upper bound on the discovered SSH config aliases reported to the model */
const MAX_SSH_CONFIG_HOSTS = 50;

/**
 * Name shown for a server: ad-hoc connections display the host the caller
 * asked for, resolved connections display their configured name.
 */
function displayName(server: ServerInfo): string {
  if (!server.adhoc) {
    return server.name;
  }

  const parts = parseAdhocKey(server.name);
  return `[adhoc] ${parts ? parts.requestedHost : server.name}`;
}

export function formatServerList(
  servers: ServerInfo[],
  options: { sshConfigHosts?: string[] } = {},
): string {
  const sshConfigHosts = options.sshConfigHosts ?? [];

  if (servers.length === 0 && sshConfigHosts.length === 0) {
    return "No SSH servers configured.";
  }

  const lines: string[] = [];
  const hasServers = servers.length > 0;

  if (!hasServers && sshConfigHosts.length > 0) {
    // 只开了 ad-hoc 的部署里，别说「没有配置」——可用目标就在下面
    lines.push(
      "No servers are configured at startup; these hosts can be targeted with the 'host' parameter:",
    );
  } else if (hasServers) {
    lines.push("Configured SSH servers:");
    for (const server of servers) {
      const parts = [
        `[${server.connected ? "connected" : "disconnected"}] ${displayName(server)}`,
        `${server.username}@${server.host}:${server.port}`,
      ];

      if (server.status?.hostname) {
        parts.push(`hostname=${server.status.hostname}`);
      }

      if (server.status?.osName) {
        parts.push(`os=${server.status.osName}`);
      }

      if (server.status?.lastUpdated) {
        parts.push(`updated=${server.status.lastUpdated}`);
      }

      lines.push(parts.join(" | "));
    }
  }

  if (sshConfigHosts.length > 0) {
    if (hasServers) {
      // 有配置连接时单独起一段；只有 ad-hoc 时紧跟在上面的引导语后面
      lines.push("", "Hosts from the SSH config, usable as the 'host' parameter:");
    }
    lines.push(...sshConfigHosts.map((host) => `  - ${host}`));
  }

  if (hasServers) {
    lines.push("", "Raw JSON:", JSON.stringify(servers, null, 2));
  }

  return lines.join("\n");
}

/**
 * Discover the hosts an ad-hoc call may target: the aliases of the SSH config
 * that are not excluded by --adhoc-host-patterns.
 */
function discoverAdhocHosts(
  sshManager: SSHConnectionManager,
): string[] {
  const policy = sshManager.getAdhocPolicy();

  if (!policy.enabled) {
    return [];
  }

  let hosts;
  try {
    hosts = listSshConfigHosts(policy.sshConfigFile);
  } catch {
    // 显式指定的配置文件读不到时，list-servers 不应整体失败
    return [];
  }

  const allowed = hosts
    .filter((host) => isHostAllowed(host.hostName || host.alias, policy.hostPatterns))
    .map((host) => {
      const target = `${host.user ? `${host.user}@` : ""}${host.hostName || host.alias}`;
      return host.port ? `${target}:${host.port}` : target;
    });

  if (allowed.length <= MAX_SSH_CONFIG_HOSTS) {
    return allowed;
  }

  return [
    ...allowed.slice(0, MAX_SSH_CONFIG_HOSTS),
    `... and ${allowed.length - MAX_SSH_CONFIG_HOSTS} more`,
  ];
}

/**
 * Register list-servers tool
 */
export function registerListServersTool(server: McpServer): void {
  server.registerTool(
    "list-servers",
    {
      description:
        "List configured SSH servers, live ad-hoc connections, and (when --allow-adhoc-hosts is enabled) the host aliases from the SSH config that can be targeted.",
    },
    async () => {
      const sshManager = SSHConnectionManager.getInstance();
      const servers = sshManager.getAllServerInfos();
      return {
        content: [
          {
            type: "text",
            text: formatServerList(servers, {
              sshConfigHosts: discoverAdhocHosts(sshManager),
            }),
          },
        ],
      };
    },
  );
}
