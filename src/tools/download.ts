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
 * Register file download tool
 */
export function registerDownloadTool(server: McpServer): void {
  const sshManager = SSHConnectionManager.getInstance();

  server.registerTool(
    "download",
    {
      description: "Download file from connected server",
      inputSchema: {
        remotePath: z.string().describe("Remote path"),
        localPath: z.string().describe("Local path"),
        connectionName: connectionNameField,
        host: hostField,
        port: portField,
        username: usernameField,
      },
    },
    async ({ remotePath, localPath, connectionName, host, port, username }) => {
      try {
        const result = await sshManager.download(
          remotePath,
          localPath,
          connectionName,
          { host, port, username },
        );
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error: unknown) {
        return toolErrorResult(error, "UNKNOWN_ERROR", "Failed to download file");
      }
    }
  );
}
