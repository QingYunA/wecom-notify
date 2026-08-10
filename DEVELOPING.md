# 开发指南（贡献者）

## 目录结构

```
index.ts      # 入口：事件注册（pi.on 原生 / pi.events.on EventBus）+ 命令注册
config.ts     # 配置读写 + webhook 打码 + 事件定义（EVENTS/DEFAULT_EVENTS/eventHook）
message.ts    # 消息构建（纯函数，可独立测试）
sender.ts     # 企业微信发送 + 日志
commands.ts   # /wecom:* 管理命令（SettingsList 弹框）
```

## 关键实现要点

- **事件注册分两类**：pi 原生生命周期事件（`agent_end`/`agent_settled`/`session_shutdown`）必须用 `pi.on()` 注册（ExtensionRunner handlers，reload 自动替换，不累积）；跨插件 EventBus 事件（`rpiv:*`/`unipi:*`/`permissions:*`）用 `pi.events.on()` 注册（返回 unsubscribe）。用 `pi.events.on()` 监听原生事件会时好时坏。
- **交互弹框**：用 `ctx.ui.custom` + `@earendil-works/pi-tui` 的 `SettingsList`（常驻组件原地重绘，不闪烁）；不要用 `ctx.ui.select` 循环重开。
- **安全**：webhook 不打印完整 URL（`maskWebhook` 打码）；日志只记 configured 状态与 errcode。
- **去重**：模块级 `lastSentAt`，5 秒内跳过。

## 本地开发

```bash
# 语法检查（pi 核心包走 peerDependencies，不打进 bundle）
npx esbuild index.ts --bundle --format=esm --platform=node \
  --external:@earendil-works/pi-coding-agent --external:@earendil-works/pi-tui

# 本地试用（临时加载，不安装）
pi -e ./index.ts

# 测试：本地开发目录放 ~/.pi/agent/extensions/wecom-notify/，/reload 生效
```

## 发布

```bash
# 1. 改版本号（package.json version）
# 2. 发布 npm（需 npm 账号 + 带 bypass 2FA 权限的 token）
npm publish --registry=https://registry.npmjs.org
# 3. 推送 GitHub
git add -A && git commit -m "..." && git push
```

发布规范（pi packages）：

- `keywords` 必须含 `pi-package`（pi.dev 画廊扫描的门槛）
- `pi` manifest 声明资源路径：`"pi": { "extensions": ["index.ts"] }`
- pi 核心包（`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`）列 `peerDependencies` `"*"`，不打进 tarball
- `files` 白名单只发布 `*.ts` + `README.md`，避免 `.git` 等混入
- 可选：`image`/`video` 字段给画廊加预览图
