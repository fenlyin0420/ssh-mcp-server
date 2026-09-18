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
 * Register execute command tool
 */
export function registerExecuteCommandTool(server: McpServer): void {
  const sshManager = SSHConnectionManager.getInstance();

  server.registerTool(
    "execute-command",
    {
      description: "Execute command on connected server and get output result",
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
        const result = await sshManager.executeCommand(
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
        return toolErrorResult(error, "UNKNOWN_ERROR", "Failed to execute command");
      }
    },
  );
}
