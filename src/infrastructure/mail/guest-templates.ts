import { createTranslator } from "next-intl";
import type { GuestMailTemplates, MailMessage } from "@/application/ports";
import messages from "../../../messages/de.json";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain paragraphs plus one button, as text and as HTML. Every value is escaped. */
function render(locale: string, subject: string, paragraphs: string[], button: { label: string; url: string }, footer?: string): Omit<MailMessage, "to"> {
  const text = [...paragraphs, `${button.label}: ${button.url}`, ...(footer ? [footer] : [])].join("\n\n") + "\n";
  const html = `<!doctype html><html lang="${locale}"><body style="font-family:system-ui,sans-serif;color:#1f1d2b;line-height:1.5">
${paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n")}
<p><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#4a2342;color:#fbf7fa;padding:12px 20px;border-radius:999px;text-decoration:none">${escapeHtml(button.label)}</a></p>
${footer ? `<p style="color:#5d5b68;font-size:14px">${escapeHtml(footer)}</p>` : ""}</body></html>`;
  return { subject, text, html };
}

export function createGuestMailTemplates(locale = "de"): GuestMailTemplates {
  const t = createTranslator({ locale, messages, namespace: "email" });
  const list = (names: string[]) => new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
  return {
    answer(m) {
      const paragraphs = [
        t("answer.intro", { household: m.household, title: m.websiteTitle }),
        [m.coming.length ? t("answer.coming", { names: list(m.coming) }) : null, m.notComing.length ? t("answer.notComing", { names: list(m.notComing) }) : null].filter(Boolean).join("\n"),
        ...(m.requests.length ? [t("answer.requests", { names: list(m.requests) })] : []),
        ...(m.message ? [t("answer.message", { message: m.message })] : []),
      ];
      return render(locale, t("answer.subject", { household: m.household }), paragraphs, { label: t("answer.button"), url: m.guestsUrl }, t("answer.footer"));
    },
    dailySummary(m) {
      const paragraphs = [
        t("summary.intro", { count: m.households.length }),
        m.households.map((h) => t("summary.line", h)).join("\n"),
        t("summary.totals", m.totals),
      ];
      return render(locale, t("summary.subject", { title: m.websiteTitle }), paragraphs, { label: t("summary.button"), url: m.guestsUrl }, t("summary.footer"));
    },
    retentionWarning(m) {
      const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(m.deleteOn);
      return render(
        locale,
        t("retention.subject", { date }),
        [t("retention.body", { title: m.websiteTitle, date }), t("retention.hint")],
        { label: t("retention.button"), url: m.guestsUrl },
      );
    },
  };
}
