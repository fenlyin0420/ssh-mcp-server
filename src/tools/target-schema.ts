import { z } from "zod";

/**
 * Target selection fields shared by every tool.
 *
 * A call either names an already configured connection (`connectionName`) or an
 * ad-hoc host (`host`, plus optional `port`/`username`). Credentials are never
 * accepted as parameters: they come from ~/.ssh/config or from the server's
 * startup flags.
 */
export const connectionNameField = z
  .string()
  .optional()
  .describe(
    "Name of a server configured at startup (optional; defaults to the default connection). Cannot be combined with 'host'.",
  );

export const hostField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Ad-hoc target: an IP/hostname or a Host alias from ~/.ssh/config. Requires the server to be started with --allow-adhoc-hosts; otherwise the call is rejected. Cannot be combined with 'connectionName'.",
  );

export const portField = z
  .number()
  .int()
  .min(1)
  .max(65535)
  .optional()
  .describe(
    "SSH port for an ad-hoc host (optional; defaults to ~/.ssh/config, then the server's default connection).",
  );

export const usernameField = z
  .string()
  .min(1)
  .optional()
  .describe(
    "SSH username for an ad-hoc host (optional; defaults to ~/.ssh/config, then the server's default connection). Passwords and key paths are never accepted as parameters.",
  );
