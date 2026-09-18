---
name: ssh-mcp-helper
description: Use when 用户希望安装、配置或新增 ssh-mcp-server 的 MCP 连接（如「帮我装一下 ssh-mcp-server」「给 Cursor/Claude Code 配置 SSH MCP」「在已有 MCP 里加一台远程主机」「配置成能连任意服务器 / ad-hoc 主机」「ssh-mcp-server 的 mcp.json 怎么写」）。技能通过逐步问答收集主机、认证、传输模式、命令限制等参数，并把生成的 mcpServers JSON 片段写入对应客户端的配置文件。
---

# ssh-mcp-helper

## 概述

帮助用户通过交互式问答完成 `@fenlyin/ssh-mcp-server` 的安装预检与 MCP 客户端配置。技能本身**不代替用户输入凭据**，而是逐项确认认证方式、连接参数与安全策略，最终产出可直接写入 MCP 客户端配置文件的 `mcpServers` JSON 片段。

**核心准则：** 所有可枚举的选项（MCP 客户端类型、认证方式、传输模式、是/否开关）必须使用 AskUserQuestion 让用户选择；只有不可枚举的输入（host、用户名、私钥路径、密码、自定义白名单正则等）才允许自由文本提问。

## 何时使用

- 用户明确要安装/配置/新增 ssh-mcp-server
- 用户提到为 Cursor / Claude Code / Cline / Continue 等客户端添加 SSH MCP
- 用户希望在已有 `mcpServers` 中追加一台 SSH 主机
- 用户问「ssh-mcp-server 的 mcp.json 怎么写」

## 何时不使用

- 用户要修改 ssh-mcp-server 源码 → 直接编辑代码，不进入向导
- 用户只是想跑某条 SSH 命令 → 直接调用已存在的 ssh-mcp-server 工具
- 用户在问 SSH 协议本身的概念 → 解释即可，无需走流程

## 工作流程

```dot
digraph ssh_mcp_helper {
    "0. 前置环境检查" [shape=box];
    "1. 选择 MCP 客户端" [shape=box];
    "2. 连接形态" [shape=diamond];
    "3. 选择认证方式" [shape=box];
    "4. 询问连接参数" [shape=box];
    "5. 询问高级选项" [shape=box];
    "6. 生成 JSON 片段" [shape=box];
    "7. 合并写入配置" [shape=box];
    "8. 提示重启与验证" [shape=doublecircle];

    "0. 前置环境检查" -> "1. 选择 MCP 客户端";
    "1. 选择 MCP 客户端" -> "2. 连接形态";
    "2. 连接形态" -> "3. 选择认证方式" [label="单台"];
    "2. 连接形态" -> "3. 选择认证方式" [label="多台 → 写 ssh-config.json"];
    "2. 连接形态" -> "3. 选择认证方式" [label="任意主机 → 加 --allow-adhoc-hosts"];
    "3. 选择认证方式" -> "4. 询问连接参数";
    "4. 询问连接参数" -> "5. 询问高级选项";
    "5. 询问高级选项" -> "6. 生成 JSON 片段";
    "6. 生成 JSON 片段" -> "7. 合并写入配置";
    "7. 合并写入配置" -> "8. 提示重启与验证";
}
```

### Step 0：前置环境检查
- 运行 `node -v` 与 `npx --version` 确认本机有 Node.js（推荐 v18+）
- 缺失则先提示用户安装 Node.js，再继续后续步骤

### Step 1：选择 MCP 客户端（AskUserQuestion 多选一）

| 客户端 | 默认配置位置 |
|---|---|
| Claude Code（全局） | `~/.claude.json` 的 `mcpServers` 字段 |
| Claude Code（项目级） | 项目根 `.mcp.json` |
| Cursor | `~/.cursor/mcp.json` |
| Cline / Continue / 其他 | 让用户提供具体路径 |

### Step 2：连接形态（AskUserQuestion 三选一）
- **单台**：直接使用命令行参数（`--host` 等）
- **多台**：生成 `ssh-config.json` 并使用 `--config-file`
- **任意主机（ad-hoc）**：追加 `--allow-adhoc-hosts`，客户端配置里**不写 host**；之后每次工具调用用 `host` 参数指定目标（IP 或 `~/.ssh/config` 别名），新增服务器无需改配置

### Step 3：选择认证方式（AskUserQuestion 多选一）
- `password` — 账号 + 密码
- `privateKey` — 账号 + 私钥；再用 AskUserQuestion 确认是否带 passphrase
- `ssh-config` — 复用 `~/.ssh/config` 中的 Host 别名（只需 `--host <alias>`，可选 `--ssh-config-file`）
- `ssh-agent` — 使用 `--agent` 指向 socket
- `2fa` — 密码 + 私钥 + 键盘交互，追加 `--try-keyboard`

> ⚠️ ad-hoc 模式下这些参数是**继承模板**：工具调用未提供的字段会先查 `~/.ssh/config`，再回落到模板。**密码默认不被 ad-hoc 主机继承**（避免把密码发往调用方指定的任意主机）；只配了密码的场景要么补一把私钥/agent，要么用户明确同意后追加 `--adhoc-allow-password-auth`。

### Step 4：连接参数（自由文本）
- host / port / username（port=22 可省略）
- 按 Step 3 的结果追问密码、私钥路径、passphrase、agent socket 等
- **ad-hoc 模式**：host 可留空（完全靠 `~/.ssh/config` 里的 Host 别名按需连接）；username/port 留空时作为模板供调用时回退

### Step 5：高级选项（每项独立用 AskUserQuestion 询问是/否）
1. SOCKS 代理：是 → 追问 `--socksProxy` 字符串
2. 命令白名单：是 → 追问逗号分隔正则（**生产环境强烈建议开启**）；若客户端是 Claude Code，再询问是否把 `run-whitelisted-command` 加入 `permissions.allow`，让命中白名单的命令免弹窗直行
3. 命令黑名单：是 → 追问逗号分隔正则
4. 命令模板：是 → 追问含 `<command>` 占位符的模板
5. 传输模式：默认 `exec`；若用户标记目标为堡垒机/跳板机，改 `shell` 并追问 `--shell-ready-timeout`
6. 路径白名单：是 → 追问 `--allowed-local-paths` / `--allowed-remote-paths`
7. ad-hoc 主机范围（仅在 Step 2 选了「任意主机」时问）：是否需要限定可连接的主机？是 → 追问逗号分隔的 glob（如 `192.168.*,xxfwq,*`），产出 `--adhoc-host-patterns`；**不限定等于任意主机可达**
8. ad-hoc 密码认证（仅 Step 2 选了「任意主机」且认证方式含密码时问）：是否允许 ad-hoc 主机继承密码？默认否，仅用户明确接受风险时才追加 `--adhoc-allow-password-auth`
9. ad-hoc transport 模式（仅 Step 2 选了「任意主机」且主连接是 `shell` 模式时问）：目标主机是否也走 shell？默认继承，需要区分时追加 `--adhoc-transport-mode exec`

### Step 6：生成 JSON 片段
装配规则：
- `command` 固定为 `"npx"`
- `args` 第一项 `"-y"`，第二项 `"@fenlyin/ssh-mcp-server"`
- **每个命令行参数与值必须是 args 数组中独立的两个元素**，绝不能写成 `"--host 192.168.1.1"`
- 多连接场景：把每个连接写入 `ssh-config.json`（数组或对象格式皆可），客户端配置里只放 `--config-file <绝对路径>`
- 任意主机场景：**不要**写 `--host`，改为 `--allow-adhoc-hosts`（可加 `--adhoc-host-patterns` 收窄范围）；保留 `--username/--privateKey/--whitelist` 等作为所有 ad-hoc 主机的继承模板
- 若客户端为 Claude Code 且启用了命令白名单，另产出 `permissions.allow` 片段：`{ "permissions": { "allow": ["mcp__ssh-mcp-server__run-whitelisted-command"] } }`，可写入项目 `.claude/settings.json` 或全局 `~/.claude/settings.json`，让命中白名单的命令免弹窗直行

### Step 7：合并写入配置
- 先用 Read 读取目标 JSON 配置文件
- 合并到既存 `mcpServers` 下；若存在同名 key，**先 AskUserQuestion 让用户选择覆盖 / 改名 / 取消**
- 写入前把最终片段展示给用户确认
- 写入后输出该配置文件的绝对路径

### Step 8：收尾
- 提示用户重启对应 MCP 客户端使配置生效
- 给出验证方式：调用 `list-servers`，或对该连接执行 `execute-command "whoami"`

## 速查表

| 场景 | 关键参数 |
|---|---|
| 账号密码 | `--host --port --username --password` |
| 私钥（可带 passphrase） | `--host --port --username --privateKey [--passphrase]` |
| 复用 ssh config 别名 | `--host <alias>` (+可选 `--ssh-config-file`) |
| SOCKS 代理 | `--socksProxy socks://user:pwd@host:port` |
| 堡垒机 / 跳板机 | `--transport-mode shell --shell-ready-timeout 15000` |
| 多连接 | `--config-file /abs/path/ssh-config.json` |
| 任意主机（ad-hoc） | `--allow-adhoc-hosts [--adhoc-host-patterns "192.168.*,esc"]`，调用时传 `host` |
| 2FA / MFA | `--try-keyboard`（搭配密码 + 私钥） |
| 命令白名单 | `--whitelist "^ls( .*)?,^cat .*"` |
| 命令黑名单 | `--blacklist "^rm .*,^shutdown.*"` |
| 白名单免弹窗直行（Claude Code） | `--whitelist ...` + `permissions.allow` 加 `mcp__ssh-mcp-server__run-whitelisted-command` |
| 命令模板 | `--command-template "su root -c '<command>'"` |
| 路径白名单 | `--allowed-local-paths` / `--allowed-remote-paths` |

## 常见坑

- ❌ 把 `"--host 192.168.1.1"` 当作一个 args 元素 → ✅ 拆成两个元素 `"--host", "192.168.1.1"`
- ❌ 密码含 `{ } = ,` 等字符却用旧式 `--ssh "name=...,password=..."` → ✅ 改用 `--config-file` 或 JSON 形式 `--ssh`
- ❌ `shell` 模式下还想用 `upload`/`download` → 该模式禁用 SFTP，需切回 `exec`
- ❌ 直接覆盖用户既有 `mcpServers` 中的同名 key → 必须先读后合并，覆盖前显式确认
- ❌ 直连生产环境却未配置 `--whitelist` / `--blacklist` → 必须主动提醒安全风险
- ❌ 以为 `--whitelist` 是硬边界 → 白名单之外的命令现在走 `execute-command` 弹窗审批，不会被执行时硬拦截；要硬拦截请用 `--blacklist`
- ❌ 把私钥内容粘进配置 → 配置里应填**私钥文件路径**，凭据留在本地
- ❌ 以为开了 `--allow-adhoc-hosts` 就能用密码连任意主机 → 密码**默认不继承**（需 `--adhoc-allow-password-auth`）；推荐用私钥/agent
- ❌ 同时传 `connectionName` 和 `host` → 二者互斥，服务端会直接报错，别猜
- ❌ 开了 ad-hoc 却把 `run-whitelisted-command` 加进客户端 allowlist 且白名单很宽 → 免确认命令的作用域会扩大到所有可达主机，建议收窄 `--adhoc-host-patterns` 与白名单

## 输出示例

最简单的账号密码场景产出：

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
        "--whitelist", "^ls( .*)?,^cat .*"
      ]
    }
  }
}
```

多连接场景产出 `ssh-config.json` + 简化的客户端配置：

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": ["-y", "@fenlyin/ssh-mcp-server", "--config-file", "/abs/path/ssh-config.json"]
    }
  }
}
```

任意主机（ad-hoc）场景：不写 host，靠 `~/.ssh/config` 别名按需连接（调用时传 `host`）：

```json
{
  "mcpServers": {
    "ssh-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@fenlyin/ssh-mcp-server",
        "--allow-adhoc-hosts",
        "--adhoc-host-patterns", "192.168.*,esc,xxfwq",
        "--username", "root",
        "--privateKey", "~/.ssh/id_rsa",
        "--whitelist", "^ls( .*)?,^cat .*,^df .*,^free .*"
      ]
    }
  }
}
```
