# wecom-notify

Pi Agent 企业微信通知扩展。将 agent 生命周期事件推送至企业微信群机器人，手机/桌面企业微信即时可达——绕开 zellij OSC 透传、Ghostty 通知注册等终端链路限制。

## 安装

```bash
pi install npm:wecom-notify   # 发布后
# 或本地开发：复制整个目录到 ~/.pi/agent/extensions/wecom-notify/
```

## 配置

配置文件 `~/.config/pi/wecom-notify.json`（可用环境变量 `WECOM_CONFIG_PATH` 覆盖路径）：

```json
{
  "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx",
  "includeSummary": true,
  "maxSummaryLength": 400,
  "events": ["workflow_end", "ralph_loop_end", "mcp_server_error", "agent_end", "ask_user_prompt"]
}
```

- `webhook` 留空 = 禁用发送（扩展正常加载，仅写日志）
- 企业微信群机器人：群设置 → 群机器人 → 添加 → 自定义机器人

## 管理命令

| 命令 | 作用 |
|---|---|
| `/wecom:status` | 查看当前配置（webhook 打码显示） |
| `/wecom:set-webhook` | 无参数 = 弹框输入 URL；或带参 `https://…`；`off`/留空 = 禁用 |
| `/wecom:set-events` | 无参数 = SettingsList 弹框勾选（9 个事件）；或带参 `a,b,c`/`default` 直接设置 |
| `/wecom:test` | 发一条测试消息 |

## 触发事件

| 事件 | 触发时机 | 消息 |
|---|---|---|
| `agent_end` | 每次回复结束 | ✅ Pi Agent 已完成 + 回复摘要 |
| `workflow_end` | 工作流结束 | ✅/❌ Workflow 完成/失败 |
| `ralph_loop_end` | Ralph loop 结束 | 🔄 Ralph Loop 结束 |
| `mcp_server_error` | MCP 服务器报错 | ❌ MCP 服务器错误 |
| `ask_user_prompt` | Agent 提问等你回答 | ❓ 需要你的输入 + 问题/选项 |
| `agent_settled` | Agent 全部收尾完成 | ✅ Pi Agent 全部完成 + 摘要 |
| `memory_consolidated` | 记忆整合完成 | 🧠 记忆整合完成 |
| `session_shutdown` | 会话结束 | 👋 Pi 会话结束 |
| `permission_request` | 权限请求 | 🔐 权限请求 |

> 事件列表与 @pi-unipi/notify 支持的 9 个事件一致。`agent_end`/`agent_settled`/`session_shutdown` 是 pi 原生事件；其余 `unipi:*`/`permissions:*` 事件由 unipi 生态插件（如 @pi-unipi/notify）投递，未安装时自然收不到，不影响其他事件。

所有消息携带公共字段：项目（git root）/ 分支 / Zellij Session / 主机 / 时间。5 秒去重防连发。

## 安全

- webhook 不写死在代码、不提交 git、不打印完整 URL（日志只记 configured 状态与 errcode）
- 通知失败仅写日志，绝不影响 pi 运行

## 日志

`~/.pi/logs/wecom-notify.log`

## 开发

```bash
# 语法检查
npx esbuild index.ts --bundle --format=esm --platform=node --external:@earendil-works/pi-coding-agent
# 本地试用
pi -e ./index.ts
```

发布：`npm publish`（pi 通过 `pi install npm:wecom-notify` 安装）。
