import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSHConnectionManager } from "../services/ssh-connection-manager.js";
import { CommandLineParser } from "../cli/command-line-parser.js";
import { Logger } from "../utils/logger.js";
import { registerAllTools } from "../tools/index.js";
import { SERVER_CONFIG } from "../config/server.js";

/**
 * MCP Server class
 */
export class SshMcpServer {
  private server: McpServer;
  private sshManager: SSHConnectionManager;
  private shutdownHandlersRegistered = false;
  private shutdownPromise?: Promise<void>;

  constructor() {
    this.server = new McpServer(SERVER_CONFIG);

    this.sshManager = SSHConnectionManager.getInstance();
  }

  /**
   * Register tools
   */
  private registerTools(): void {
    registerAllTools(this.server);
  }

  private async shutdown(reason: string, exitCode?: number): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = (async () => {
        Logger.log(`Received ${reason}, shutting down SSH MCP server...`, "info");

        this.sshManager.disconnect();

        try {
          await this.server.close();
        } catch (error) {
          Logger.log(
            `Failed to close MCP server cleanly: ${(error as Error).message}`,
            "error",
          );
        }
      })();
    }

    await this.shutdownPromise;

    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  }

  private registerShutdownHandlers(): void {
    if (this.shutdownHandlersRegistered) {
      return;
    }

    const handleSignal = (signal: NodeJS.Signals) => {
      void this.shutdown(signal, 0);
    };

    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
    process.stdin.resume();
    process.stdin.once("end", () => void this.shutdown("stdin end", 0));
    process.stdin.once("close", () => void this.shutdown("stdin close", 0));

    this.shutdownHandlersRegistered = true;
  }

  /**
   * Run the server
   */
  public async run(): Promise<void> {
    // Initialize SSH configuration
    const parsedArgs = CommandLineParser.parseArgs();
    this.sshManager.setConfig(parsedArgs.configs);
    if (parsedArgs.adhoc) {
      this.sshManager.setAdhocPolicy(parsedArgs.adhoc);
    }
    this.registerShutdownHandlers();

    // Register tools before accepting MCP requests.
    this.registerTools();

    // Create transport instance and connect.
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    Logger.log("MCP server connection established");

    // Security warning
    const allConfigs = Object.values(parsedArgs.configs);
    if (
      allConfigs.some(
        (c) => !c.commandWhitelist || c.commandWhitelist.length === 0
      )
    ) {
      Logger.log(
        "WARNING: Running without a command whitelist is strongly discouraged. Please configure a whitelist to restrict the commands that can be executed.",
        "info"
      );
    }
    if (
      allConfigs.some(
        (c) =>
          (c.transportMode || "exec") === "exec" &&
          (!c.allowedRemotePaths || c.allowedRemotePaths.length === 0)
      )
    ) {
      Logger.log(
        "WARNING: Running without allowedRemotePaths is strongly discouraged. SFTP upload/download can read or write any path on the remote server. Configure allowedRemotePaths to restrict the SFTP surface.",
        "info"
      );
    }

    const adhoc = parsedArgs.adhoc;
    if (adhoc?.enabled) {
      const patterns = adhoc.hostPatterns?.join(",") || "*";
      Logger.log(
        `Ad-hoc host targeting enabled (host patterns: ${patterns}, password auth: ${
          adhoc.allowPasswordAuth ? "enabled" : "disabled"
        }). Tool calls may target hosts beyond the configured ones.`,
        "info",
      );

      if (!adhoc.hostPatterns || adhoc.hostPatterns.length === 0) {
        Logger.log(
          "WARNING: Any host reachable with the inherited credentials can be targeted through the 'host' parameter. Use --adhoc-host-patterns to restrict the reachable hosts.",
          "info",
        );
      }

      if (adhoc.allowPasswordAuth) {
        Logger.log(
          "WARNING: --adhoc-allow-password-auth is set: the configured password (and keyboard-interactive auth) may be sent to hosts chosen by the caller. Prefer key or agent authentication.",
          "info",
        );
      }

      // ad-hoc 连接继承第一个已配置连接的策略；没有已配置连接时用启动模板
      const adhocBase =
        Object.values(parsedArgs.configs)[0] ?? adhoc.defaults;
      if (!adhocBase?.commandWhitelist || adhocBase.commandWhitelist.length === 0) {
        Logger.log(
          "WARNING: Ad-hoc hosts inherit no command whitelist, so run-whitelisted-command will reject every command on them (execute-command with approval still works). Configure --whitelist to allow routine commands.",
          "info",
        );
      }
      if (
        (adhocBase?.transportMode || "exec") === "exec" &&
        (!adhocBase?.allowedRemotePaths ||
          adhocBase.allowedRemotePaths.length === 0)
      ) {
        Logger.log(
          "WARNING: Ad-hoc hosts inherit no allowedRemotePaths, so SFTP upload/download can read or write any path on any ad-hoc host. Configure --allowed-remote-paths to restrict the SFTP surface.",
          "info",
        );
      }
    }

    // SSH connections are established lazily when tools are invoked,
    // so the MCP server can start without requiring VPN or network access.
  }
}
