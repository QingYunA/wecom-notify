/**
 * wecom-notify — 管理命令
 *
 * /wecom:status        查看配置状态（webhook 打码）
 * /wecom:set-webhook   设置/清除 webhook（off 或空 = 禁用）
 * /wecom:set-events    设置触发事件列表（逗号分隔；default = 恢复默认）
 * /wecom:test          发送测试消息
 *
 * 写配置后立即重建监听，无需 /reload。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList } from "@earendil-works/pi-tui";
import { DEFAULT_EVENTS, EVENTS, configPath, loadConfig, maskWebhook, saveConfig } from "./config.ts";
import { buildTestMessage } from "./message.ts";
import { sendWecom } from "./sender.ts";

export function registerCommands(pi: ExtensionAPI, onConfigChanged: () => void): void {
  pi.registerCommand("wecom:status", {
    description: "查看企业微信通知配置状态",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cfg = loadConfig();
      const items = [
        "--- 当前配置 ---",
        `Webhook: ${maskWebhook(cfg.webhook)}`,
        `回复摘要: ${cfg.includeSummary ? "开" : "关"}（最多 ${cfg.maxSummaryLength} 字）`,
        `触发事件 (${cfg.events.length}): ${cfg.events.join(", ")}`,
        `配置文件: ${configPath()}`,
        "",
        "--- 管理命令 ---",
        "/wecom:set-webhook <url|off>",
        "/wecom:set-events <a,b,c|default>",
        "/wecom:test",
      ];
      await ctx.ui.select("企业微信通知 (wecom-notify)", items);
    },
  });

  pi.registerCommand("wecom:set-webhook", {
    description: "设置/清除企业微信 webhook（无参数=弹框输入；off 或留空 = 禁用发送）",
    handler: async (args: string, ctx: ExtensionContext) => {
      const cfg = loadConfig();
      let url = args.trim();

      if (!url) {
        if (ctx.mode !== "tui") {
          ctx.ui.notify("无参数时需要 TUI，请直接传 webhook URL 或 off", "warning");
          return;
        }
        const input = await ctx.ui.input(
          "企业微信 webhook URL（留空或 off = 清除，禁用发送）",
          cfg.webhook ? maskWebhook(cfg.webhook) : ""
        );
        if (input === undefined) {
          ctx.ui.notify("已取消。", "info");
          return;
        }
        url = input.trim();
      }

      if (!url || url === "off") {
        cfg.webhook = "";
        saveConfig(cfg);
        onConfigChanged();
        ctx.ui.notify("Webhook 已清除，通知已禁用。", "info");
        return;
      }
      if (!url.startsWith("https://")) {
        ctx.ui.notify("无效的 webhook URL（须以 https:// 开头）", "error");
        return;
      }
      cfg.webhook = url;
      saveConfig(cfg);
      onConfigChanged();
      ctx.ui.notify(`Webhook 已保存并生效: ${maskWebhook(url)}`, "info");
    },
  });

  pi.registerCommand("wecom:set-events", {
    description: "设置触发事件（无参数=交互选择；或逗号分隔列表；default=恢复默认）",
    getArgumentCompletions: (prefix: string) => {
      const all = ["default", ...DEFAULT_EVENTS];
      const filtered = all.filter((s) => s.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((v) => ({ value: v, label: v })) : null;
    },
    handler: async (args: string, ctx: ExtensionContext) => {
      const cfg = loadConfig();
      const raw = args.trim();

      // 带参数：直接设置（兼容旧用法）
      if (raw) {
        cfg.events = raw === "default"
          ? [...DEFAULT_EVENTS]
          : [...new Set(raw.split(/[,，\s]+/).filter(Boolean))];
        saveConfig(cfg);
        onConfigChanged();
        ctx.ui.notify(`触发事件已更新: ${cfg.events.join(", ")}`, "info");
        return;
      }

      // 无参数：SettingsList 交互 toggle（常驻弹框，原地重绘不闪烁）
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/wecom:set-events 交互模式需要 TUI，可用参数形式: agent_end,ask_user_prompt", "warning");
        return;
      }
      const ordered = () => EVENTS.map((e) => e.id).filter((id) => cfg.events.includes(id));

      await ctx.ui.custom((tui, theme, _kb, done) => {
        const items: SettingItem[] = EVENTS.map((ev) => ({
          id: ev.id,
          label: `${ev.id} — ${ev.label}`,
          currentValue: cfg.events.includes(ev.id) ? "on" : "off",
          values: ["on", "off"],
        }));

        const container = new Container();
        container.addChild(
          new (class {
            render(_width: number) {
              return [
                theme.fg("accent", theme.bold("触发事件 (wecom-notify)")),
                theme.fg("dim", "←→ 或回车切换 · Esc 退出（修改即时生效）"),
                "",
              ];
            }
            invalidate() {}
          })()
        );

        const settingsList = new SettingsList(
          items,
          Math.min(items.length + 2, 15),
          getSettingsListTheme(),
          (id: string, newValue: string) => {
            if (newValue === "on") {
              cfg.events = [...new Set([...cfg.events, id])];
            } else {
              cfg.events = cfg.events.filter((x) => x !== id);
            }
            cfg.events = ordered();
            saveConfig(cfg);
            onConfigChanged();
          },
          () => done(undefined),
          { enableSearch: true }
        );
        container.addChild(settingsList);

        return {
          render: (w: number) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            settingsList.handleInput?.(data);
            tui.requestRender();
          },
        };
      });
      ctx.ui.notify(`触发事件: ${ordered().join(", ")}`, "info");
    },
  });

  pi.registerCommand("wecom:test", {
    description: "发送一条测试消息到企业微信",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const cfg = loadConfig();
      if (!cfg.webhook) {
        ctx.ui.notify("Webhook 未配置，先运行 /wecom:set-webhook", "warning");
        return;
      }
      const r = await sendWecom(cfg.webhook, buildTestMessage());
      ctx.ui.notify(r.ok ? "测试消息已发送 ✅" : `发送失败: ${r.detail}`, r.ok ? "info" : "error");
    },
  });
}
