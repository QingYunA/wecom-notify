# pi-wecom-notify

Pi Agent 企业微信通知扩展 — agent 完成任务、执行失败、或向你提问时，自动推送企业微信群机器人，**手机 / 桌面企业微信即时可达**。绕开终端通知的所有限制（zellij OSC 透传、Ghostty 通知注册、SSH 窗口切换），多 Agent 并行时靠 Session 字段一眼区分。

## Features

- ✅ **任务完成即通知** — 回复结束 1~2 秒内推送，含项目 / Git 分支 / Session / 主机 / 时间
- ✅ **回复摘要** — 自动提取 agent 最后一条回复（可配置长度）
- ✅ **提问提醒** — agent 向你提问等待输入时单独推送（配合 `@juicesharp/rpiv-ask-user-question`）
- ✅ **错误通知** — 工作流失败、MCP 服务器错误单独推送
- ✅ **多 Agent 区分** — Zellij Session 字段让你知道该切到哪个窗口
- ✅ **5 秒去重** — 防连发
- ✅ **全量管理命令** — `/wecom:*` 弹框式配置，改完立即生效，无需重启
- ✅ **零依赖** — 只用 Node 内置 API 与 pi 核心，无第三方运行时依赖

## 安装

```bash
pi install npm:pi-wecom-notify
```

## 快速开始

**1. 建群机器人**：企业微信群 → 群设置 → 群机器人 → 添加机器人 → 自定义机器人，复制 Webhook URL（形如 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx`）。

**2. 配置**：编辑 `~/.config/pi/wecom-notify.json`（或用命令 `/wecom:set-webhook`，粘贴即生效，无需 reload）：

```json
{
  "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key",
  "includeSummary": true,
  "maxSummaryLength": 400,
  "events": ["agent_end", "workflow_end", "ralph_loop_end", "mcp_server_error", "ask_user_prompt"]
}
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `webhook` | `""`（禁用） | 企业微信群机器人 Webhook |
| `machineName` | hostname | 自定义机器名，多机器同 webhook 时区分（消息标题带 `[机器名]` 前缀） |
| `includeSummary` | `true` | 是否附带回复摘要 |
| `maxSummaryLength` | `400` | 摘要最大字数，超出截断 |
| `events` | 见默认值 | 触发事件列表（用 `/wecom:set-events` 弹框勾选） |

**3. 验证**：`/wecom:test` 发送测试消息，或直接开始对话——回复结束后企业微信自动收到通知。

> 环境变量 `WECOM_CONFIG_PATH` 可覆盖配置文件路径（多配置 / 测试用）。

## 管理命令

| 命令 | 作用 |
|---|---|
| `/wecom:status` | 查看当前配置（webhook 打码显示） |
| `/wecom:set-webhook` | 弹框输入 Webhook（`off` 或留空 = 禁用发送） |
| `/wecom:set-machine` | 弹框设置机器名（多机器区分；留空 = 恢复 hostname） |
| `/wecom:set-events` | SettingsList 弹框勾选触发事件（支持 `/` 搜索） |
| `/wecom:test` | 发送测试消息 |

## 触发事件

| 事件 | 触发时机 | 推送内容 |
|---|---|---|
| `agent_end` | 每次回复结束 | ✅ Pi Agent 已完成 + 摘要 |
| `agent_settled` | Agent 全部收尾完成 | ✅ Pi Agent 全部完成 + 摘要 |
| `workflow_end` | 工作流结束 | ✅/❌ Workflow 完成/失败 |
| `ralph_loop_end` | Ralph loop 结束 | 🔄 Ralph Loop 结束 |
| `mcp_server_error` | MCP 服务器报错 | ❌ MCP 服务器错误 |
| `ask_user_prompt` | Agent 提问等你回答 | ❓ 需要你的输入 + 问题/选项 |
| `memory_consolidated` | 记忆整合完成 | 🧠 记忆整合完成 |
| `session_shutdown` | 会话结束 | 👋 Pi 会话结束 |
| `permission_request` | 权限请求 | 🔐 权限请求 |

> 事件投递说明：`agent_end` / `agent_settled` / `session_shutdown` 是 pi 原生事件，开箱即用；`ask_user_prompt` 由 [@juicesharp/rpiv-ask-user-question](https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question) 投递；其余 `unipi:*` 事件由 unipi 生态插件投递，未安装时自然收不到，不影响其他事件。

## 通知示例

```
### ✅ [工作机] Pi Agent 已完成

> **项目**：excel2plot
> **分支**：main
> **Session**：backend
> **机器**：工作机
> **时间**：2026/8/10 14:32

**完成摘要**：
修改 reply 返回类型为 Array<string>，补充了单测

状态：等待下一步指令
```

## 多机器同 webhook

多台机器共用同一个 webhook 时，每台机器设置不同的 `machineName`，消息**标题直接带 `[机器名]` 前缀**，手机上一眼区分是哪台机器发的：

```bash
# 每台机器分别执行（弹框输入，立即生效）
/wecom:set-machine 工作机
/wecom:set-machine 家里服务器
/wecom:set-machine VPS-日本
```

不设置则用系统 hostname。

## 安全

- Webhook 仅存于配置文件，不写死在代码、不进仓库、日志不打印完整 URL
- 通知失败只写日志，绝不影响 pi 正常运行（日志：`~/.pi/logs/wecom-notify.log`）

## FAQ

**Q: 每个回复结束都通知，太频繁？** 用 `/wecom:set-events` 只保留 `ask_user_prompt`（提问时才推送），或后续等长任务阈值功能。

**Q: 和 @pi-unipi/notify 的关系？** 独立。本扩展只发企业微信，不依赖任何 unipi 组件；两者可同时使用（桌面通知 + 微信通知）。

**Q: 多台机器都要收通知？** 每台机器各自 `pi install` + 配置同一个 webhook 即可，群里都能收到。

## License

MIT
