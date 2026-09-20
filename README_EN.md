<div align="center">

<img src="images/ssh-mcp-server-logo-v2.png" alt="ssh-mcp-server logo" width="220">

# ssh-mcp-server

![NPM Version](https://img.shields.io/npm/v/%40fenlyin%2Fssh-mcp-server?label=%40fenlyin%2Fssh-mcp-server)
![GitHub forks](https://img.shields.io/github/forks/fenlyin0420/ssh-mcp-server)
![GitHub Repo stars](https://img.shields.io/github/stars/fenlyin0420/ssh-mcp-server)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/fenlyin0420/ssh-mcp-server)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues-closed/fenlyin0420/ssh-mcp-server)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues-pr/fenlyin0420/ssh-mcp-server)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues-pr-closed/fenlyin0420/ssh-mcp-server)

SSH-based MCP (Model Context Protocol) server that allows remote execution of SSH commands via the MCP protocol.

English Document | [中文文档](README.md)

</div>

## 📝 Project Overview

ssh-mcp-server is a bridging tool that enables AI assistants and other applications supporting the MCP protocol to execute remote SSH commands through a standardized interface. This allows AI assistants to safely operate remote servers, execute commands, and retrieve results without directly exposing SSH credentials to AI models.

## ✨ Key Features

- **🔒 Secure Connections**: Supports multiple secure SSH connection methods, including password authentication and private key authentication (with passphrase support)
- **🛡️ Command Security Control**: Precisely control the range of allowed commands through flexible blacklist and whitelist mechanisms to prevent dangerous operations
- **🔄 Standardized Interface**: Complies with MCP protocol specifications for seamless integration with AI assistants supporting the protocol
- **🚇 Dual Transport Modes**: Supports both `exec` and `shell` transport modes for direct SSH hosts and bastion or jump-host scenarios
- **📂 File Transfer**: Supports bidirectional file transfers, uploading local files to servers or downloading files from servers
- **🔑 Credential Isolation**: SSH credentials are managed entirely locally and never exposed to AI models, enhancing security
- **🌐 Connect to Any Server**: With `--allow-adhoc-hosts`, a tool call can pick its target through the `host` parameter (an IP or a `~/.ssh/config` alias) — adding a server never requires touching the configuration
- **🚀 Ready to Use**: Can be run directly using NPX without global installation, making it convenient and quick to deploy

## 📦 Open Source Repository

GitHub: [https://github.com/fenlyin0420/ssh-mcp-server](https://github.com/fenlyin0420/ssh-mcp-server)

NPM: [https://www.npmjs.com/package/@fenlyin/ssh-mcp-server](https://www.npmjs.com/package/@fenlyin/ssh-mcp-server)

## 🛠️ Tools List

| Tool | Name | Description |
|---------|-----------|----------|
| execute-command | Command Execution Tool (approval) | Execute SSH commands on remote servers and get results; requires a client approval prompt per call |
| run-whitelisted-command | Whitelisted Command Tool | Executes only commands matching the connection's whitelist; pair with a client allowlist to run without a prompt |
| upload | File Upload Tool | Upload local files to specified locations on remote servers |
| download | File Download Tool | Download files from remote servers to local specified locations |
| list-servers | List Servers Tool | List configured servers, live ad-hoc connections, and usable host aliases from the SSH config |

Every tool except `list-servers` also accepts optional `host` / `port` / `username` parameters to pick the target at call time (requires `--allow-adhoc-hosts`; see [Connecting to any server](#11-🌐-connecting-to-any-server-ad-hoc-hosts)). Credentials come only from `~/.ssh/config` or the startup flags — they are **never** passed as tool parameters.

## 📚 Usage

### 0. 🤖 Quick Setup via AI Skill (Recommended)

If you are using an AI coding assistant that supports skills (such as Claude Code), you can use the built-in **ssh-mcp-helper** skill to complete the installation and configuration interactively — no need to manually edit JSON files.

**How to use:**

1. Install the skill from this repository's `skills/` directory
2. Tell your AI assistant: "Help me set up ssh-mcp-server" or "Configure SSH MCP for my remote server"
3. The skill will guide you step by step: check Node.js environment → choose MCP client → select authentication method → collect connection parameters → generate and write configuration

The skill supports all scenarios covered below (password, private key, SSH config reuse, SOCKS proxy, bastion hosts, multi-connection, 2FA, command restrictions, etc.) and automatically produces correctly formatted configuration.

---

The sections below are arranged from the simplest entry point (username + password) to more advanced scenarios. Pick the case that matches yours and copy the `mcp.json` snippet directly into your MCP client configuration.

> **⚠️ Important**: In MCP configuration files, each command line argument and its value must be separate elements in the `args` array. Do NOT combine them with spaces. For example, use `"--host", "192.168.1.1"` instead of `"--host 192.168.1.1"`.

### 1. 🔑 Username + Password (simplest)

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "192.168.1.1",
        "--port", "22",
        "--username", "root",
        "--password", "pwd123456"
      ]
    }
  }
}
```

### 2. 🔐 Username + Private Key

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "192.168.1.1",
        "--port", "22",
        "--username", "root",
        "--privateKey", "~/.ssh/id_rsa"
      ]
    }
  }
}
```

### 3. 🔏 Private Key with Passphrase

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "192.168.1.1",
        "--port", "22",
        "--username", "root",
        "--privateKey", "~/.ssh/id_rsa",
        "--passphrase", "pwd123456"
      ]
    }
  }
}
```

### 4. 📋 Reuse `~/.ssh/config`

If you already have a host alias in `~/.ssh/config`, the server reads connection parameters directly from it — no need to repeat them in `mcp.json`.

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "myserver"
      ]
    }
  }
}
```

Assuming your `~/.ssh/config` contains:

```
Host myserver
    HostName 192.168.1.1
    Port 22
    User root
    IdentityFile ~/.ssh/id_rsa
```

You can also specify a custom SSH config file path:

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "myserver",
        "--ssh-config-file", "/path/to/custom/ssh_config"
      ]
    }
  }
}
```

**Note**: Command-line parameters take precedence over SSH config values. For example, if you specify `--port 2222`, it will override the port from SSH config.

### 5. 🌐 Connecting Through a Proxy

When the target host is only reachable through a proxy, use `--proxy` with a SOCKS5, HTTP, or HTTPS proxy.

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "192.168.1.1",
        "--port", "22",
        "--username", "root",
        "--password", "pwd123456",
        "--proxy", "http://username:password@proxy-host:proxy-port"
      ]
    }
  }
}
```

Supported URL formats:

```text
socks://username:password@proxy-host:1080
socks5://username:password@proxy-host:1080
http://username:password@proxy-host:8080
https://username:password@proxy-host:8443
```

HTTP and HTTPS proxies use the `CONNECT` method to tunnel to the SSH server, with optional Basic proxy authentication. HTTP and HTTPS default to ports `80` and `443`; SOCKS5 requires an explicit port. HTTPS proxy certificates are verified using the default Node.js trust store.

The existing `socksProxy` configuration and `--socksProxy` option remain supported for backward compatibility, but only accept `socks://` and `socks5://`. Do not configure both `proxy` and `socksProxy`.

### 6. 📝 Restricting Commands With Whitelist / Blacklist

Use `--whitelist` and `--blacklist` to limit which commands the server is allowed to run. Patterns are comma-separated regular expressions. **Strongly recommended** for any production use.

- **`--whitelist`**: defines the set of commands that run *without approval*. Commands matching the whitelist can be executed directly via the `run-whitelisted-command` tool.
- **`--blacklist`**: a hard boundary. Commands matching the blacklist are always rejected — regardless of which tool is used or whether a human approved.

Whitelist example (only allow read-only inspection commands):

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "192.168.1.1",
        "--port", "22",
        "--username", "root",
        "--password", "pwd123456",
        "--whitelist", "^ls( .*)?,^cat .*,^df.*"
      ]
    }
  }
}
```

Blacklist example (block destructive commands):

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "192.168.1.1",
        "--port", "22",
        "--username", "root",
        "--password", "pwd123456",
        "--blacklist", "^rm .*,^shutdown.*,^reboot.*"
      ]
    }
  }
}
```

> Note: If both whitelist and blacklist are specified, both rules apply: the whitelist decides which commands run without approval, while the blacklist hard-blocks any command (including whitelisted ones).

#### 🚀 Run Without Prompt + Approve With Prompt (Recommended Workflow)

An MCP server cannot trigger Claude Code's permission popup — the popup is controlled entirely by the client. To get "whitelisted commands run directly, everything else prompts", command execution is split into two tools:

| Tool | Behavior | When it prompts |
|---|---|---|
| `run-whitelisted-command` | MUST match the connection's whitelist, otherwise fails with `COMMAND_NOT_WHITELISTED` | **Never prompts** once allowlisted in the client; non-matching commands are rejected by the server and never run |
| `execute-command` | Runs any command (except blacklisted); the whitelist no longer blocks it | **Prompts every time**; runs after a human approves |

In Claude Code, add `run-whitelisted-command` to `permissions.allow` so routine commands run without a prompt:

```json
{
  "permissions": {
    "allow": ["mcp__ssh-mcp-server__run-whitelisted-command"]
  }
}
```

Workflow: prefer `run-whitelisted-command` for routine operations → if the command matches the whitelist it runs immediately; otherwise it returns `COMMAND_NOT_WHITELISTED` and Claude falls back to `execute-command` → Claude Code prompts → the command runs after approval. Blacklisted commands are rejected on every path.

> **⚠️ Note**: `commandWhitelist` is a *no-approval* allowlist — commands outside it are not hard-blocked; they route to `execute-command` for a prompt. Use `commandBlacklist` for hard blocking. The server is always the single source of truth for the whitelist, so allowlisting `run-whitelisted-command` can never execute commands outside the whitelist.

### 7. 🧩 Wrapping Commands With a Template

`commandTemplate` wraps every executed command in a template — useful for switching user via `su`, running inside a container, or jumping through another host. Use `<quotedCommand>` when the command is passed as a shell argument, or `<command>` for raw insertion. The template is applied **after** the working-directory `cd` is prepended, so the entire `cd ... && <actual command>` chain gets wrapped.

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "10.0.0.1",
        "--port", "22",
        "--username", "deploy",
        "--password", "xxx",
        "--command-template", "su root -c <quotedCommand>"
      ]
    }
  }
}
```

Executing `ls /app` with directory `/data` actually sends:

```
su root -c 'cd -- '\''/data'\'' && ls /app'
```

Other useful templates:

```text
sudo bash -c <quotedCommand>
docker exec -i mycontainer sh -c <quotedCommand>
ssh jumphost <quotedCommand>
```

### 8. 🚇 Bastion / Jump Host (`transportMode: shell`)

`transportMode` defaults to `exec`. Switch to `shell` when:

- SSH login succeeds but `exec` command execution fails
- The remote side requires shell startup scripts, banners, or environment initialization first
- The target effectively exposes only an interactive shell (bastion hosts, jump hosts, network devices)

Behavior differences:

- `exec`: supports `execute-command`, `upload`, and `download`
- `shell`: runs commands through a persistent shell session with an internal command queue, but does **not** support `upload` / `download` because SFTP is unavailable in this mode

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "bastion.example.com",
        "--port", "22",
        "--username", "ops",
        "--password", "pwd123456",
        "--transport-mode", "shell",
        "--shell-ready-timeout", "15000"
      ]
    }
  }
}
```

In JSON config files you can also set `shellCommandTimeoutMs` to override the default per-command timeout for shell-backed connections.

### 9. 🔐 Multi-Factor Authentication (2FA / MFA)

When the SSH server requires multi-factor authentication (password + private key + 2FA verification code), enable `tryKeyboard`. The password and private key are auto-supplied. For non-password prompts, set `SSH_MCP_2FA_CODE` in the server environment before connecting.

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--host", "example.com",
        "--port", "22",
        "--username", "user",
        "--password", "your_password",
        "--privateKey", "/path/to/key",
        "--try-keyboard"
      ]
    }
  }
}
```

**Authentication flow:**
1. Private key authentication (if provided)
2. Password authentication (if provided)
3. Keyboard-interactive for 2FA code via `SSH_MCP_2FA_CODE`

### 10. 🧩 Managing Multiple SSH Connections

When you need to expose more than one SSH target through the same MCP server, register them under unique connection names and select the target at call time via `connectionName`. There are three ways to configure them:

#### 📄 Method 1: Using Config File (Recommended)

Create a JSON configuration file (e.g., `ssh-config.json`):

**Array Format:**
```json
[
  {
    "name": "dev",
    "host": "1.2.3.4",
    "port": 22,
    "username": "alice",
    "password": "{abc=P100s0}",
    "socksProxy": "socks://127.0.0.1:10808",
    "maxOutputBytes": 10485760
  },
  {
    "name": "bastion",
    "host": "9.9.9.9",
    "port": 22,
    "username": "ops",
    "password": "pwd123456",
    "transportMode": "shell",
    "shellReadyTimeoutMs": 15000,
    "shellCommandTimeoutMs": 45000,
    "connectionTimeoutMs": 30000,
    "keepaliveIntervalMs": 10000,
    "keepaliveCountMax": 3
  },
  {
    "name": "prod",
    "host": "5.6.7.8",
    "port": 22,
    "username": "bob",
    "password": "yyy",
    "socksProxy": "socks://127.0.0.1:10808"
  },
  {
    "name": "secure-server",
    "host": "secure.example.com",
    "port": 22,
    "username": "admin",
    "password": "your_password",
    "privateKey": "/path/to/private/key",
    "tryKeyboard": true
  }
]
```

**Object Format:**
```json
{
  "dev": {
    "host": "1.2.3.4",
    "port": 22,
    "username": "alice",
    "password": "{abc=P100s0}",
    "socksProxy": "socks://127.0.0.1:10808",
    "maxOutputBytes": 10485760
  },
  "bastion": {
    "host": "9.9.9.9",
    "port": 22,
    "username": "ops",
    "password": "pwd123456",
    "transportMode": "shell",
    "shellReadyTimeoutMs": 15000,
    "shellCommandTimeoutMs": 45000
  },
  "prod": {
    "host": "5.6.7.8",
    "port": 22,
    "username": "bob",
    "password": "yyy",
    "socksProxy": "socks://127.0.0.1:10808"
  }
}
```

Then use the `--config-file` parameter:

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--config-file", "ssh-config.json"
      ]
    }
  }
}
```

#### 🔧 Method 2: Using JSON Format with --ssh Parameter

You can pass JSON-formatted configuration strings directly:

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--ssh", "{\"name\":\"dev\",\"host\":\"1.2.3.4\",\"port\":22,\"username\":\"alice\",\"password\":\"{abc=P100s0}\",\"socksProxy\":\"socks://127.0.0.1:10808\"}",
        "--ssh", "{\"name\":\"bastion\",\"host\":\"9.9.9.9\",\"port\":22,\"username\":\"ops\",\"password\":\"pwd123456\",\"transportMode\":\"shell\",\"shellReadyTimeoutMs\":15000}",
        "--ssh", "{\"name\":\"prod\",\"host\":\"5.6.7.8\",\"port\":22,\"username\":\"bob\",\"password\":\"yyy\",\"socksProxy\":\"socks://127.0.0.1:10808\"}"
      ]
    }
  }
}
```

#### 📝 Method 3: Legacy Comma-Separated Format (Backward Compatible)

For simple cases without special characters in passwords, you can still use the legacy format:

```bash
npx @fenlyin/ssh-mcp-server \
  --ssh "name=dev,host=1.2.3.4,port=22,user=alice,password=xxx" \
  --ssh "name=prod,host=5.6.7.8,port=22,user=bob,password=yyy"
```

> **⚠️ Note**: The legacy format may have issues with passwords containing special characters like `=`, `,`, `{`, `}`. Use Method 1 or Method 2 for passwords with special characters.

In MCP tool calls, specify the connection name via the `connectionName` parameter. If omitted, the default connection is used.

Example (execute command on 'prod' connection):

```json
{
  "tool": "execute-command",
  "params": {
    "cmdString": "ls -al",
    "connectionName": "prod"
  }
}
```

Example (execute command with timeout options):

```json
{
  "tool": "execute-command",
  "params": {
    "cmdString": "ping -c 10 127.0.0.1",
    "connectionName": "prod",
    "timeout": 5000
  }
}
```

### 11. 🌐 Connecting to any server (ad-hoc hosts)

In the sections above the target host is fixed in the configuration: switching servers means editing the config, reinstalling the MCP entry and restarting the client. With `--allow-adhoc-hosts` a tool call picks its own target through the `host` parameter, and **no host needs to be configured at all**:

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--allow-adhoc-hosts",
        "--username", "root",
        "--privateKey", "~/.ssh/id_rsa",
        "--whitelist", "^ls( .*)?,^cat .*,^tail .*,^df .*,^free .*,^ps .*"
      ]
    }
  }
}
```

You can then just ask for a host, and the model will pass it as `host`:

```json
{
  "tool": "execute-command",
  "params": {
    "cmdString": "df -h",
    "host": "esc"
  }
}
```

#### How connection parameters are resolved

`host` may be an IP, a hostname, or a **Host alias** from `~/.ssh/config`. Each field resolves in this order:

| Field | Precedence (left to right) |
|---|---|
| Destination | `HostName` from `~/.ssh/config` → the `host` passed by the call |
| Username | tool `username` → SSH config `User` → the default connection's user (`--username`) |
| Port | tool `port` → SSH config `Port` → `--port` (default 22) |
| Private key | SSH config `IdentityFile` → the default connection (`--privateKey`) |
| Agent / proxy / timeouts / whitelist / blacklist / path limits | startup flags (the default connection's settings) |

In other words: **host-specific knowledge from the SSH config wins, everything else is inherited from the startup flags**. If `~/.ssh/config` already has an entry like `Host esc / User fenlyin`, then `host: "esc"` just works.

> ℹ️ **The default connection still applies**: when `--host` is configured, calls without `host` target it as before. With no `--host` at all (as above), every call must name a `host`.

#### Safety switches

| Flag | Effect |
|---|---|
| `--allow-adhoc-hosts` | Master switch (default off). While off, a call carrying `host` is rejected explicitly instead of silently running on the default host |
| `--adhoc-host-patterns <globs>` | Narrows "any host" to an allowlist, e.g. `192.168.*,esc,xxfwq`; supports `*`/`?` globs and `!` negation, matched against the **resolved destination** (so an alias cannot point somewhere else to bypass it). Matching is **case-sensitive**, like SSH config Host patterns |
| `--adhoc-allow-password-auth` | Ad-hoc hosts do **not** inherit the password by default (it would be sent to whatever host the caller names). Not needed for key/agent setups |
| `--adhoc-transport-mode <exec\|shell>` | Ad-hoc hosts inherit the startup transport mode; use this to override it |

Other boundaries:

- The whitelist, blacklist and path limits are inherited wholesale from the default connection. Without a whitelist, `run-whitelisted-command` rejects everything on ad-hoc hosts and the model falls back to `execute-command` (with approval).
- Ad-hoc connections are reused per host + port + username, with at most 16 kept alive; the least recently used one is evicted and reconnected on demand.
- Ad-hoc hosts do **not** trigger the startup status collection, so no probe commands run on a machine you merely touched once.
- `connectionName` and `host` are mutually exclusive: the former selects a configured connection, the latter an ad-hoc target. Passing both is an error rather than a guess.

#### Connection lifecycle (per-command overhead)

The SSH connection for each target is established **once** and then reused:

- The first call to a target opens the TCP/SSH connection and caches it in the connection pool; later calls reuse the same connection and only open a fresh exec / SFTP channel per command, which is closed when done. So repeated commands on the same target pay the handshake cost only once — subsequent calls are millisecond-scale.
- The connection is kept alive by SSH keepalives (a probe every 10 s by default; 3 consecutive failures mark it dead). If it drops, the next call reconnects automatically — no reconfiguration needed.
- Tool parameters only accept `host` / `port` / `username`; **passwords and private key paths are never accepted** (credentials must not be sent to an arbitrary caller-named host). The target must therefore be reachable with the key from the startup flags (or the `IdentityFile` in the SSH config).
- A call without `host` when `--host` was also not configured fails with `NO_TARGET_SPECIFIED`, telling you to name a target.

### ⏱️ Command Execution Timeout

The `execute-command` tool supports timeout options to prevent commands from hanging indefinitely:

- **timeout**: Command execution timeout in milliseconds (optional, default is 30000ms)
- In `shell` mode, you can also set `shellCommandTimeoutMs` per connection in the JSON config file
- Connections use SSH keepalives by default (`keepaliveIntervalMs`: 10000, `keepaliveCountMax`: 3) and respect `connectionTimeoutMs` for connection setup
- SFTP open and transfer operations respect `sftpTimeoutMs` (default 300000ms)
- Error responses include stable `code`, `message`, and `retriable` fields for easier agent-side handling

This is particularly useful for commands like `ping`, `tail -f`, or other long-running processes that might block execution.

### 📦 Command Output Limit

In `exec` mode, the combined captured `stdout` and `stderr` for each command is limited to protect the MCP server from large files or unbounded output:

- Set `maxOutputBytes` in a JSON connection configuration; the default is `10485760` bytes (10 MiB)
- `maxOutputBytes` must be a non-negative integer; `0` disables the limit, which is not recommended for untrusted commands
- When output exceeds the limit, the remote command is aborted and the tool returns an `OUTPUT_LIMIT_EXCEEDED` error with the captured, truncated output instead of reporting success
- With `pty: false`, warnings and progress written to `stderr` by successful commands are preserved in a `[stderr]` section
- The limit currently applies only to `exec` mode; `shell` mode does not use `maxOutputBytes`

### 🗂️ List All SSH Servers

You can use the MCP tool `list-servers` to get all available SSH server configurations:

Example call:

```json
{
  "tool": "list-servers",
  "params": {}
}
```

Example response:

```json
[
  { "name": "dev", "host": "1.2.3.4", "port": 22, "username": "alice", "connected": true },
  { "name": "prod", "host": "5.6.7.8", "port": 22, "username": "bob", "connected": false },
  { "name": "adhoc:esc:22:root", "host": "esc", "port": 22, "username": "root", "connected": true, "adhoc": true }
]
```

`connected` shows whether that target's connection is currently alive in the pool (useful to tell whether a connection still needs to be warmed up).

With `--allow-adhoc-hosts` the response also carries two extra kinds of information:

- **Live ad-hoc connections** (`adhoc: true`, rendered as `[adhoc] <requested host>` followed by the actual destination). Their raw `name` looks like `adhoc:esc:22:root` and can be reused as a `connectionName`.
- The **usable host aliases** from `~/.ssh/config` (filtered by `--adhoc-host-patterns`, capped at 50), ready to be passed as `host`.

### ⚙️ Command Line Options Reference

```text
Options:
  --config-file       JSON configuration file path (recommended for multiple servers)
  --ssh-config-file   SSH config file path (default: ~/.ssh/config)
  --ssh               SSH connection configuration (can be JSON string or legacy format)
  -h, --host          SSH server host address or alias from SSH config
  -p, --port          SSH server port
  -u, --username      SSH username
  -w, --password      SSH password
  -k, --privateKey    SSH private key file path
  -P, --passphrase    Private key passphrase (if any)
  -a, --agent         SSH agent socket path
  --try-keyboard      Enable keyboard-interactive authentication for 2FA/MFA (default: false)
  -W, --whitelist     Command whitelist, comma-separated regular expressions
  -B, --blacklist     Command blacklist, comma-separated regular expressions
  --proxy             Proxy URL supporting SOCKS5, HTTP, and HTTPS
  -s, --socksProxy    Legacy SOCKS5 proxy URL
  --allowed-local-paths   Additional allowed local paths for upload/download, comma-separated
  --allowed-remote-paths  Allowed remote (POSIX, absolute) paths for SFTP upload/download, comma-separated
  --transport-mode    SSH transport mode: exec or shell (default: exec)
  --shell-ready-timeout   Shell readiness probe timeout in milliseconds (default: 10000)
  --command-template  Command template, use <quotedCommand> for shell arguments or <command> for raw insertion
  --allow-adhoc-hosts   Allow tool calls to target any host via the 'host' parameter (default: false)
  --adhoc-host-patterns Restrict ad-hoc hosts to these glob patterns, comma-separated (default: any)
  --adhoc-allow-password-auth  Inherit password/keyboard-interactive auth for ad-hoc hosts (default: false)
  --adhoc-transport-mode  Transport mode for ad-hoc hosts: exec or shell (default: inherited)
  --pty               Allocate pseudo-tty for command execution (default: true)
  --version, -v       Print package version
  --help              Print this help message
```

## 🛡️ Security Considerations

This server provides powerful capabilities to execute commands and transfer files on remote servers. To ensure it is used securely, please consider the following:

- **Command Whitelisting**: It is *strongly recommended* to use `--whitelist` to define the set of commands that run without approval, and only allowlist `run-whitelisted-command` in the client. Commands outside the whitelist route to `execute-command` for a prompt. For **hard blocking**, configure `commandBlacklist` — it is the only mechanism that unconditionally prevents a command from running. With no restrictions at all, any command can be executed.
- **Private Key Security**: The server reads the SSH private key into memory. Ensure that the machine running the `ssh-mcp-server` is secure. Do not expose the server to untrusted networks.
- **Denial of Service (DoS)**: The server does not have built-in rate limiting. An attacker could potentially launch a DoS attack by flooding the server with connection requests or large file transfers. It is recommended to run the server behind a firewall or reverse proxy with rate-limiting capabilities.
- **Path Traversal**: The server has built-in protection against path traversal attacks on the local filesystem. However, it is still important to be mindful of the paths used in `upload` and `download` commands.
- **Local Transfer Scope**: By default, local file transfers are restricted to the current working directory. Use `--allowed-local-paths` or `allowedLocalPaths` in config only for explicitly trusted directories.
- **Remote Transfer Scope**: SFTP upload/download accepts only absolute POSIX paths. If `allowedRemotePaths` (or `--allowed-remote-paths`) is not configured, any remote path is accepted and the server prints a startup warning. Configure `allowedRemotePaths` to whitelist a small set of remote directories; this is strongly recommended to prevent prompt-injection-driven reads or writes of files like `~/.ssh/authorized_keys` or `/etc/sshd_config`.
- **Ad-hoc hosts (`--allow-adhoc-hosts`)**: enabling it widens the auto-approved `run-whitelisted-command` from one fixed machine to every reachable host matching `--adhoc-host-patterns`, all sharing the default connection's key/agent. Therefore:
  - narrow the range with `--adhoc-host-patterns` (omitting it means *any* host);
  - keep `--whitelist` as small as possible (read-only commands, ideally) and consider **not** allowlisting `run-whitelisted-command` in the client while ad-hoc is on;
  - remember that ad-hoc hosts **do not inherit the password** unless `--adhoc-allow-password-auth` is set, so a password never travels to a model-chosen host by default;
  - note that this server performs **no host key verification** (ssh2's default): when the target is chosen by the model, a man-in-the-middle is theoretically possible — another reason to keep the allowlist tight.

## 🌟 Star History

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=fenlyin0420/ssh-mcp-server&type=date&legend=top-left&sealed_token=ndORao73xOZgyX7IvlIIOynMoeEP5Ds9YAG-zOfMMBlNepLdP3e7T7k9K94X8TdvuxplN5DXLolbF9jFFsYDD-1V0V8HO6B3swaPOvJaonKeiFNdAuWsXg)](https://www.star-history.com/?type=date&legend=top-left&repos=fenlyin0420%2Fssh-mcp-server)
