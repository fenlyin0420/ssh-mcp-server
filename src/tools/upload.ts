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
 * Register file upload tool
 */
export function registerUploadTool(server: McpServer): void {
  const sshManager = SSHConnectionManager.getInstance();

  server.registerTool(
    "upload",
    {
      description: "Upload file to connected server",
      inputSchema: {
        localPath: z.string().describe("Local path"),
        remotePath: z.string().describe("Remote path"),
        connectionName: connectionNameField,
        host: hostField,
        port: portField,
        username: usernameField,
      },
    },
    async ({ localPath, remotePath, connectionName, host, port, username }) => {
      try {
        const result = await sshManager.upload(
          localPath,
          remotePath,
          connectionName,
          { host, port, username },
        );
        return {
          content: [{ type: "text", text: result }],
        };
      } catch (error: unknown) {
        return toolErrorResult(error, "UNKNOWN_ERROR", "Failed to upload file");
      }
    }
  );
}
