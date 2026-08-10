/**
 * wecom-notify — 企业微信发送与日志
 *
 * 日志路径 ~/.pi/logs/wecom-notify.log，绝不打印完整 webhook URL。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOG_DIR = path.join(os.homedir(), ".pi", "logs");
const LOG_PATH = path.join(LOG_DIR, "wecom-notify.log");

export function log(msg: string): void {
  try {
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* 日志失败不影响通知功能 */
  }
}

export interface SendResult {
  ok: boolean;
  detail: string;
}

/** 发送企业微信 markdown 消息；失败不抛错，返回结果并写日志。 */
export async function sendWecom(webhook: string, content: string): Promise<SendResult> {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msgtype: "markdown", markdown: { content } }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as { errcode?: number; errmsg?: string };
  const ok = res.ok && data.errcode === 0;
  if (ok) {
    log("发送成功 errcode=0");
    return { ok: true, detail: "ok" };
  }
  const detail = `HTTP ${res.status}, errcode=${data.errcode ?? "?"}, errmsg=${data.errmsg ?? "?"}`;
  log(`发送失败: ${detail}`);
  return { ok: false, detail };
}
