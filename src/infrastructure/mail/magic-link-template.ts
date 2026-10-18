import { createTranslator } from "next-intl";
import type { MagicLinkMailTemplate } from "@/application/ports";
import messages from "../../../messages/de.json";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function createMagicLinkTemplate(locale = "de"): MagicLinkMailTemplate {
  const t = createTranslator({ locale, messages, namespace: "email.magicLink" });
  return {
    render(link, minutes) {
      const lines = { greeting: t("greeting"), intro: t("intro"), button: t("button"), expiry: t("expiry", { minutes }), ignore: t("ignore") };
      return {
        subject: t("subject"),
        text: `${lines.greeting}\n\n${lines.intro}\n\n${link}\n\n${lines.expiry}\n${lines.ignore}\n`,
        html: `<!doctype html><html lang="${locale}"><body style="font-family:system-ui,sans-serif;color:#1f1d2b;line-height:1.5">
<p>${escapeHtml(lines.greeting)}</p><p>${escapeHtml(lines.intro)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#4a2342;color:#fbf7fa;padding:12px 20px;border-radius:999px;text-decoration:none">${escapeHtml(lines.button)}</a></p>
<p style="color:#5d5b68;font-size:14px">${escapeHtml(lines.expiry)}<br>${escapeHtml(lines.ignore)}</p></body></html>`,
      };
    },
  };
}
