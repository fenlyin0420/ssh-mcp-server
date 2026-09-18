import { Logger } from "./logger.js";

export type ToolErrorCode =
  | "COMMAND_VALIDATION_FAILED"
  | "COMMAND_NOT_WHITELISTED"
  | "COMMAND_EXECUTION_ERROR"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "COMMAND_TIMEOUT"
  | "SSH_CONNECTION_FAILED"
  | "SSH_CONNECTION_TIMEOUT"
  | "SSH_AUTHENTICATION_MISSING"
  | "LOCAL_PATH_NOT_ALLOWED"
  | "REMOTE_PATH_NOT_ALLOWED"
  | "LOCAL_FILE_READ_FAILED"
  | "LOCAL_FILE_WRITE_FAILED"
  | "OPERATION_TIMEOUT"
  | "SFTP_ERROR"
  | "UNSUPPORTED_IN_SHELL_MODE"
  | "ADHOC_NOT_ENABLED"
  | "ADHOC_HOST_NOT_ALLOWED"
  | "ADHOC_TARGET_INVALID"
  | "NO_TARGET_SPECIFIED"
  | "UNKNOWN_ERROR";

export class ToolError extends Error {
  constructor(
    public readonly code: ToolErrorCode,
    message: string,
    public readonly retriable: boolean = false,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export function toToolError(
  error: unknown,
  fallbackCode: ToolErrorCode,
): ToolError {
  if (error instanceof ToolError) {
    return error;
  }

  if (error instanceof Error) {
    return new ToolError(fallbackCode, error.message, false);
  }

  return new ToolError(fallbackCode, String(error), false);
}

/**
 * Build the MCP tool result for a failed call: logs the error and returns the
 * structured {code, message, retriable} payload with isError set.
 */
export function toolErrorResult(
  error: unknown,
  fallbackCode: ToolErrorCode,
  logPrefix: string,
): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const toolError = toToolError(error, fallbackCode);
  Logger.handleError(toolError, logPrefix);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            code: toolError.code,
            message: toolError.message,
            retriable: toolError.retriable,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
