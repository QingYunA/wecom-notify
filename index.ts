/**
 * wecom-notify — Pi Agent 企业微信通知扩展（入口）
 *
 * 监听 agent 生命周期事件，向企业微信群机器人推送通知。
 * 独立于桌面通知链路（绕过 zellij OSC 透传问题）。
 * 触发事件默认与 @pi-unipi/notify 启用的事件一致，可在配置中调整。
 *
 * 配置：~/.config/pi/wecom-notify.json（可用 /wecom:* 命令管理）
 * 日志：~/.pi/logs/wecom-notify.log（绝不打印完整 webhook URL）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configPath, eventHook, loadConfig } from "./config.ts";
import { buildContent } from "./message.ts";
import { log, sendWecom } from "./sender.ts";
import { registerCommands } from "./commands.ts";

const DEDUP_MS = 5000;

/** pi 原生生命周期事件：必须用 pi.on() 注册（ExtensionRunner handlers，reload 自动替换，不累积） */
const LIFECYCLE_EVENTS = new Set(["agent_end", "agent_settled", "session_shutdown"]);

export default function wecomNotify(pi: ExtensionAPI): void {
  const unsubs: Array<() => void> = [];
  let lastSentAt = 0;

  /** （重新）注册事件监听：取消旧的、按当前配置重建。命令改配置后调用即可立即生效。 */
  function setupNotifications(): void {
    for (const unsub of unsubs) {
      try { unsub(); } catch { /* ignore */ }
    }
    unsubs.length = 0;

    const config = loadConfig();
    if (!config.webhook) {
      log(`Webhook configured: false — 编辑 ${configPath()} 或运行 /wecom:set-webhook`);
      return;
    }
    log(`Webhook configured: true, events=[${config.events.join(", ")}]`);

    for (const eventKey of config.events) {
      const hook = eventHook(eventKey);
      const handler = (payload: unknown) => {
        const now = Date.now();
        if (now - lastSentAt < DEDUP_MS) return; // 去重：防连发
        lastSentAt = now;
        void (async () => {
          try {
            await sendWecom(config.webhook, buildContent(config, eventKey, payload));
          } catch (e) {
            log(`通知发送异常: ${e instanceof Error ? e.message : String(e)}`);
          }
        })();
      };
      try {
        if (LIFECYCLE_EVENTS.has(eventKey)) {
          // pi 原生生命周期事件：pi.on() 注册，reload 时由 pi 自动替换，不会累积
          (pi as any).on(hook, handler);
        } else {
          // unipi 生态 EventBus 事件
          unsubs.push(pi.events.on(hook, handler));
        }
      } catch (e) {
        log(`事件注册失败 ${eventKey}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  pi.on("session_start", () => {
    setupNotifications();
  });

  pi.on("session_shutdown", () => {
    for (const unsub of unsubs) {
      try { unsub(); } catch { /* ignore */ }
    }
    unsubs.length = 0;
  });

  registerCommands(pi, setupNotifications);
}
