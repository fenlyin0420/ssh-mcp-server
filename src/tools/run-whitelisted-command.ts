import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SSHConnectionManager } from "../services/ssh-connection-manager.js";
import { toolErrorResult } from "../utils/tool-error.js";
import {
  connectionNameField,
  hostField,
  portField,
  usernameField,
} from "./target-schema.js";

/**
 * Register the run-whitelisted-command tool.
 *
 * Executes only commands that match the connection's command whitelist. Unlike
 * execute-command (which is gated by a client-side permission prompt), this tool
 * is meant to be allowlisted in the client (e.g. Claude Code
 * `permissions.allow: ["mcp__ssh-mcp-server__run-whitelisted-command"]`) so
 * routine whitelisted commands run without a prompt. Non-whitelisted commands
 * fail with COMMAND_NOT_WHITELISTED and should fall back to execute-command.
 */
export function registerRunWhitelistedCommandTool(server: McpServer): void {
  const sshManager = SSHConnectionManager.getInstance();

  server.registerTool(
    "run-whitelisted-command",
    {
      description: [
        "Execute a command that matches this connection's command whitelist and return the output.",
        "The command MUST be in the connection's whitelist; otherwise the tool fails with COMMAND_NOT_WHITELISTED.",
        "Use this tool for routine whitelisted operations to avoid an approval prompt.",
        "For commands that are not whitelisted, use execute-command instead (it asks the user for approval before running).",
        "When targeting an ad-hoc 'host', the whitelist inherited from the default connection applies.",
      ].join(" "),
      inputSchema: {
        cmdString: z.string().describe("Command to execute"),
        directory: z.string().optional().describe("Working directory for command execution"),
        connectionName: connectionNameField,
        host: hostField,
        port: portField,
        username: usernameField,
        timeout: z
          .number()
          .optional()
          .describe(
            "Command execution timeout in milliseconds (optional, default is 30000ms)",
          ),
      },
    },
    async ({ cmdString, directory, connectionName, host, port, username, timeout }) => {
      try {
        const result = await sshManager.executeWhitelistedCommand(
          cmdString,
          directory,
          connectionName,
          {
            timeout,
            host,
            port,
            username,
          },
        );
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error: unknown) {
        return toolErrorResult(
          error,
          "UNKNOWN_ERROR",
          "Failed to execute whitelisted command",
        );
      }
    },
  );
}
