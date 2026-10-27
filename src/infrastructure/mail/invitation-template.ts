import { createTranslator } from "next-intl";
import type { InvitationMailTemplate } from "@/application/ports";
import messages from "../../../messages/de.json";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function createInvitationTemplate(locale = "de", timeZone = "Europe/Berlin"): InvitationMailTemplate {
  const t = createTranslator({ locale, messages, namespace: "email.invitation" });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone });
  return {
    render({ link, inviter, weddingTitle, role, expiresOn }) {
      const values = { inviter, title: weddingTitle };
      const lines = {
        greeting: t("greeting"),
        intro: t("intro", values),
        role: t(role === "admin" ? "roleAdmin" : "roleEditor"),
        button: t("button"),
        expiry: t("expiry", { date: date.format(expiresOn) }),
        ignore: t("ignore"),
      };
      return {
        subject: t("subject", values),
        text: `${lines.greeting}\n\n${lines.intro}\n${lines.role}\n\n${link}\n\n${lines.expiry}\n${lines.ignore}\n`,
        html: `<!doctype html><html lang="${locale}"><body style="font-family:system-ui,sans-serif;color:#1f1d2b;line-height:1.5">
<p>${escapeHtml(lines.greeting)}</p><p>${escapeHtml(lines.intro)}<br>${escapeHtml(lines.role)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#4a2342;color:#fbf7fa;padding:12px 20px;border-radius:999px;text-decoration:none">${escapeHtml(lines.button)}</a></p>
<p style="color:#5d5b68;font-size:14px">${escapeHtml(lines.expiry)}<br>${escapeHtml(lines.ignore)}</p></body></html>`,
      };
    },
  };
}
