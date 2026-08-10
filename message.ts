/**
 * wecom-notify — 消息构建（纯函数，可独立测试）
 *
 * 按事件构建企业微信 markdown 消息。公共字段：
 * 项目（git root basename）/ 分支 / Zellij Session / 主机 / 时间
 */

import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { resolveMachineName, type WecomConfig } from "./config.ts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

/** 截断长文本，超出追加提示。 */
export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…（完整内容请回终端查看）` : text;
}

/** 跑一个快命令，失败返回 null（绝不抛错）。 */
export function sh(args: string[]): string | null {
  try {
    const out = execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", timeout: 3000 });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** 从 agent_end payload 提取最后一条 assistant 文本。 */
export function extractLastAssistantText(payload: unknown): string | null {
  const p = payload as { messages?: Array<{ role?: string; content?: unknown }> };
  if (!p?.messages || !Array.isArray(p.messages)) return null;
  for (let i = p.messages.length - 1; i >= 0; i--) {
    const msg = p.messages[i];
    if (msg?.role !== "assistant") continue;
    const content = msg.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .filter(isRecord)
        .map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : ""))
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return null;
}

/** ask_user_prompt payload → 问题文本。 */
export function buildAskMessage(payload: unknown): string {
  const questions = isRecord(payload) && Array.isArray(payload.questions)
    ? (payload.questions as unknown[]).filter(isRecord)
    : [];
  if (questions.length === 0) {
    const q = isRecord(payload) ? str(payload.question, "A question") : "A question";
    const ctx = isRecord(payload) ? str(payload.context, "") : "";
    return ctx ? `${q} — ${ctx}` : q;
  }
  const first = questions[0];
  const base = str(first.question, "A question");
  const suffix = questions.length > 1 ? ` (+${questions.length - 1} more)` : "";
  const options = Array.isArray(first.options)
    ? (first.options as unknown[]).filter(isRecord).map((o) => str(o.label, "")).filter(Boolean)
    : [];
  return options.length ? `${base}${suffix} — ${options.join(", ")}` : `${base}${suffix}`;
}

/** 公共环境字段行（机器名用 resolveMachineName 解析）。 */
export function commonLines(config: WecomConfig): string[] {
  const gitRoot = sh(["rev-parse", "--show-toplevel"]);
  const project = gitRoot ? path.basename(gitRoot) : path.basename(process.cwd());
  const branch = sh(["branch", "--show-current"]) ?? "N/A";
  const session = process.env.ZELLIJ_SESSION_NAME || "N/A";
  const time = new Date().toLocaleString("zh-CN", { hour12: false });
  return [
    `> **项目**：${project}`,
    `> **分支**：${branch}`,
    `> **Session**：${session}`,
    `> **机器**：${resolveMachineName(config)}`,
    `> **时间**：${time}`,
  ];
}

/** 标题行：所有事件统一带 [机器名] 前缀，多机器一眼区分 */
function titleLine(machine: string, emoji: string, text: string): string {
  return `### ${emoji} [${machine}] ${text}`;
}

/** 按事件构建企业微信 markdown 内容。 */
export function buildContent(config: WecomConfig, eventKey: string, payload: unknown): string {
  const machine = resolveMachineName(config);
  const lines: string[] = [];
  const common = (): void => { lines.push("", ...commonLines(config), "", "状态：等待下一步指令"); };

  switch (eventKey) {
    case "workflow_end": {
      const p = isRecord(payload) ? payload : {};
      const failed = p.success === false;
      lines.push(titleLine(machine, failed ? "❌" : "✅", `Workflow ${failed ? "执行失败" : "完成"}`));
      lines.push("", `> **命令**：${str(p.command, "unknown")}`, `> **结果**：${failed ? "失败" : "成功"}`);
      common();
      break;
    }
    case "ralph_loop_end": {
      const p = isRecord(payload) ? payload : {};
      lines.push(titleLine(machine, "🔄", "Ralph Loop 结束"));
      lines.push("", `> **名称**：${str(p.name, "unknown")}`, `> **状态**：${str(p.status, "completed")}`);
      common();
      break;
    }
    case "mcp_server_error": {
      const p = isRecord(payload) ? payload : {};
      lines.push(titleLine(machine, "❌", "MCP 服务器错误"));
      lines.push("", `> **服务器**：${str(p.name, "unknown")}`, `> **错误**：${clip(str(p.error, "unknown error"), 200)}`);
      common();
      break;
    }
    case "ask_user_prompt": {
      lines.push(titleLine(machine, "❓", "Pi Agent 需要你的输入"));
      lines.push("", `> **问题**：${clip(buildAskMessage(payload), 200)}`);
      common();
      break;
    }
    case "agent_settled": {
      lines.push(titleLine(machine, "✅", "Pi Agent 全部完成"));
      lines.push("", ...commonLines(config));
      if (config.includeSummary) {
        const text = extractLastAssistantText(payload);
        if (text) lines.push("", "**完成摘要**：", clip(text, config.maxSummaryLength));
      }
      lines.push("", "状态：等待下一步指令");
      break;
    }
    case "memory_consolidated": {
      const p = isRecord(payload) ? payload : {};
      lines.push(titleLine(machine, "🧠", "记忆整合完成"));
      lines.push("", `> **条数**：${str(p.count, "?")}`);
      common();
      break;
    }
    case "session_shutdown": {
      lines.push(titleLine(machine, "👋", "Pi 会话结束"));
      lines.push("", ...commonLines(config));
      break;
    }
    case "permission_request": {
      const p = isRecord(payload) ? payload : {};
      lines.push(titleLine(machine, "🔐", "权限请求"));
      const detail = [str(p.agentName, ""), str(p.surface, ""), str(p.value, "")].filter(Boolean).join(" · ");
      if (detail) lines.push("", `> **请求**：${clip(detail, 200)}`);
      const msg = str(p.message, "");
      if (msg) lines.push("", clip(msg, 200));
      common();
      break;
    }
    default: {
      // agent_end
      lines.push(titleLine(machine, "✅", "Pi Agent 已完成"));
      lines.push("", ...commonLines(config));
      if (config.includeSummary) {
        const text = extractLastAssistantText(payload);
        if (text) lines.push("", "**完成摘要**：", clip(text, config.maxSummaryLength));
      }
      lines.push("", "状态：等待下一步指令");
      break;
    }
  }
  return lines.join("\n");
}

/** /wecom:test 用的固定测试消息。 */
export function buildTestMessage(config: WecomConfig): string {
  return [
    `### ✅ [${resolveMachineName(config)}] 企业微信通知测试`,
    "",
    `> **机器**：${resolveMachineName(config)}`,
    `> **时间**：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    "",
    "如果你看到这条消息，说明 pi-wecom-notify 配置正确。",
  ].join("\n");
}
