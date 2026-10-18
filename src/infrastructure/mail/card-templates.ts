import { createTranslator } from "next-intl";
import type { CardMailTemplates, CardTexts, MailMessage } from "@/application/ports";
import { CARD_KINDS, type CardKind } from "@/domain/cards";
import messages from "../../../messages/de.json";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Parts = { subject: string; paragraphs: string[]; image?: { cid: string; alt: string }; button: { label: string; url: string }; footer: string[]; unsubscribe: { label: string; url: string } };

/**
 * Emails to guests: the couple's text, the card as an attached inline image (no remote images, so nothing
 * can track opening), one button to the household's page, and a footer saying who sent it and why, with
 * the unsubscribe link.
 */
function render(locale: string, parts: Parts): Omit<MailMessage, "to"> {
  const text = [...parts.paragraphs, `${parts.button.label}: ${parts.button.url}`, ...parts.footer].join("\n\n") + "\n";
  const p = (s: string) => `<p>${escapeHtml(s).replace(/\n/g, "<br>")}</p>`;
  const html = `<!doctype html><html lang="${locale}"><body style="font-family:system-ui,sans-serif;color:#1f1d2b;line-height:1.5;max-width:560px;margin:0 auto;padding:16px">
${parts.paragraphs.map(p).join("\n")}
${parts.image ? `<p><img src="cid:${parts.image.cid}" alt="${escapeHtml(parts.image.alt)}" width="420" style="width:100%;max-width:420px;height:auto;border-radius:6px"></p>` : ""}
<p><a href="${escapeHtml(parts.button.url)}" style="display:inline-block;background:#4a2342;color:#fbf7fa;padding:12px 20px;border-radius:999px;text-decoration:none">${escapeHtml(parts.button.label)}</a></p>
<div style="color:#5d5b68;font-size:13px;border-top:1px solid #e4e1e8;margin-top:24px;padding-top:12px">
${parts.footer.slice(0, -1).map(p).join("\n")}
<p><a href="${escapeHtml(parts.unsubscribe.url)}" style="color:#5d5b68">${escapeHtml(parts.unsubscribe.label)}</a></p>
</div></body></html>`;
  return { subject: parts.subject, text, html };
}

export function createCardMailTemplates(locale = "de"): CardMailTemplates {
  const t = createTranslator({ locale, messages, namespace: "email" });
  const footer = (couple: string, url: string) => [t("guestFooter.sender", { couple }), t("guestFooter.unsubscribe", { url })];
  const unsubscribe = (url: string) => ({ label: t("guestFooter.unsubscribeLink"), url });
  return {
    card(m) {
      return render(locale, {
        subject: t(`card.subject.${m.kind}`, { couple: m.couple }),
        paragraphs: [m.message, t("card.linkHint", { household: m.household })].filter(Boolean),
        image: { cid: m.imageCid, alt: t(`card.imageAlt.${m.kind}`, { couple: m.couple }) },
        button: { label: t(`card.button.${m.kind}`), url: m.pageUrl },
        footer: footer(m.couple, m.unsubscribeUrl),
        unsubscribe: unsubscribe(m.unsubscribeUrl),
      });
    },
    reminder(m) {
      const date = m.replyBy ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(m.replyBy) : null;
      return render(locale, {
        subject: t("reminder.subject", { couple: m.couple }),
        paragraphs: [m.message, ...(date ? [t("reminder.replyBy", { date })] : [])],
        button: { label: t("reminder.button"), url: m.pageUrl },
        footer: footer(m.couple, m.unsubscribeUrl),
        unsubscribe: unsubscribe(m.unsubscribeUrl),
      });
    },
  };
}

/** Labels on cards and defaults for new cards, from the message catalogue. */
export function createCardTexts(locale = "de"): CardTexts {
  const t = createTranslator({ locale, messages, namespace: "cards" });
  const byKind = <T,>(fn: (kind: CardKind) => T) => Object.fromEntries(CARD_KINDS.map((k) => [k, fn(k)])) as Record<CardKind, T>;
  return {
    labels: { locale, eyebrow: byKind((k) => t(`labels.eyebrow.${k}`)), replyBy: t.raw("labels.replyBy") as string, time: t.raw("labels.time") as string },
    defaults: byKind((k) => ({ heading: t.raw(`defaults.${k}.heading`) as string, text: t.raw(`defaults.${k}.text`) as string, message: t.raw(`defaults.${k}.message`) as string })),
    reminderMessage: t.raw("reminderMessage") as string,
    sampleHousehold: t("sampleHousehold"),
    calendarTitle: t.raw("calendarTitle") as string,
  };
}
