/**
 * wecom-notify — 配置管理
 *
 * 配置文件默认 ~/.config/pi/wecom-notify.json
 * （可用环境变量 WECOM_CONFIG_PATH 覆盖路径，便于多配置/测试）
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface WecomConfig {
  /** 企业微信群机器人 webhook，空字符串 = 禁用发送 */
  webhook: string;
  /** agent_end 时附带最后一条回复摘要 */
  includeSummary: boolean;
  /** 摘要最大字数 */
  maxSummaryLength: number;
  /** 触发事件列表（pi 生命周期事件名） */
  events: string[];
}

export interface EventDef {
  id: string;
  /** 中文说明（弹框里展示） */
  label: string;
  /** 实际监听的事件名：pi 原生 hook 或 unipi 生态 EventBus 事件 */
  hook: string;
}

/** 与 @pi-unipi/notify 支持的 9 个事件保持一致 */
export const EVENTS: EventDef[] = [
  { id: "agent_end", label: "每次回复结束", hook: "agent_end" },
  { id: "workflow_end", label: "工作流结束", hook: "unipi:workflow:end" },
  { id: "ralph_loop_end", label: "Ralph 循环结束", hook: "unipi:ralph:loop:end" },
  { id: "mcp_server_error", label: "MCP 服务器错误", hook: "unipi:mcp:server:error" },
  { id: "ask_user_prompt", label: "Agent 提问等你回答", hook: "rpiv:ask-user:prompt" },
  { id: "agent_settled", label: "Agent 全部完成", hook: "agent_settled" },
  { id: "memory_consolidated", label: "记忆整合完成", hook: "unipi:memory:consolidated" },
  { id: "session_shutdown", label: "会话结束", hook: "session_shutdown" },
  { id: "permission_request", label: "权限请求", hook: "permissions:ui_prompt" },
];

/** 默认启用（与 unipi 当前配置一致） */
export const DEFAULT_EVENTS = [
  "workflow_end",
  "ralph_loop_end",
  "mcp_server_error",
  "agent_end",
  "ask_user_prompt",
];

/** 事件 id → 实际监听 hook 名 */
export function eventHook(id: string): string {
  return EVENTS.find((e) => e.id === id)?.hook ?? id;
}

export function configPath(): string {
  return process.env.WECOM_CONFIG_PATH || path.join(os.homedir(), ".config", "pi", "wecom-notify.json");
}

export function defaultConfig(): WecomConfig {
  return { webhook: "", includeSummary: true, maxSummaryLength: 400, events: [...DEFAULT_EVENTS] };
}

export function loadConfig(): WecomConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8")) as Partial<WecomConfig>;
    return { ...defaultConfig(), ...raw };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(cfg: WecomConfig): void {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`);
}

/** webhook 打码显示（只露 key 首尾 4 位），避免完整 URL 进会话/日志。 */
export function maskWebhook(url: string): string {
  if (!url) return "(未配置)";
  const m = url.match(/key=([^&]+)/);
  if (m) return `https://qyapi.weixin.qq.com/…key=${m[1].slice(0, 4)}…${m[1].slice(-4)}`;
  return "https://…";
}
