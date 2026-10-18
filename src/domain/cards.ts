import { z } from "zod";
import type { Feature } from "./billing";
import { type CardKind, CARD_KINDS, type HouseholdCardKind } from "./card-kinds";
import { imageKey, optional, requiredText, text } from "./fields";
import type { FontPairing } from "./fonts";
import { parseWith, type Parsed } from "./result";
import type { CardLayout, Palette, ResolvedDesign } from "./theme";

export { CARD_KINDS, HOUSEHOLD_CARD_KINDS, isCardKind, isHouseholdCardKind, type CardKind, type HouseholdCardKind } from "./card-kinds";

/**
 * Wedding mail: Save the Dates, invitations, thank-you cards and the engagement announcement. Designing is
 * free; what the cards unlock (links, export, email) depends on the tier in CARD_FEATURES.
 */
export const CARD_FEATURES = {
  saveTheDate: "saveTheDates",
  invitation: "invitations",
  thankYou: "thankYouCards",
  engagement: "engagementCards",
} as const satisfies Record<CardKind, Feature>;

/** URL segments of the card editor and the engagement page. */
export const CARD_SLUGS = {
  saveTheDate: "save-the-date",
  invitation: "einladung",
  thankYou: "dankeskarte",
  engagement: "verlobung",
} as const satisfies Record<CardKind, string>;

export function cardKindFromSlug(slug: string): CardKind | null {
  return CARD_KINDS.find((k) => CARD_SLUGS[k] === slug) ?? null;
}

// ---- content ----

/** Every text a card can have; each kind uses the fields in CARD_FIELDS. */
export type CardContent = {
  heading: string;
  names: string;
  text: string;
  /** Save the Date: the place; empty hides it. */
  place: string;
  /** Invitation: the schedule item whose date, time and venue the card shows. */
  eventId: string | null;
  /** Invitation: overrides for the event's time and venue; empty uses the schedule. */
  time: string;
  venue: string;
  showReplyBy: boolean;
  showWebsiteLink: boolean;
};

export const CARD_FIELDS = {
  saveTheDate: ["names", "place", "text"],
  invitation: ["heading", "names", "eventId", "time", "venue", "text", "showReplyBy"],
  thankYou: ["heading", "names", "text"],
  engagement: ["heading", "names", "text", "showWebsiteLink"],
} as const satisfies Record<CardKind, readonly (keyof CardContent)[]>;

export const CARD_TEXT_MAX = 800;
export const MESSAGE_MAX = 600;

export const MAX_REMINDERS = 5;
export const MAX_REMINDER_DAYS = 90;
/** Automatic reminders for a new invitation, in days before the reply-by date (my call: two weeks and three days). */
export const DEFAULT_REMINDER_DAYS = [14, 3];

/** The content of a new card: names and place from the website, the rest from the (translated) defaults. */
export function defaultCardContent(kind: CardKind, website: { title: string; location: string | null }, defaults: { heading: string; text: string }): CardContent {
  return {
    heading: defaults.heading,
    names: website.title,
    text: defaults.text,
    place: kind === "saveTheDate" ? (website.location ?? "") : "",
    eventId: null,
    time: "",
    venue: "",
    showReplyBy: true,
    showWebsiteLink: false,
  };
}

const contentSchema = z.object({
  heading: text(120),
  names: requiredText(120),
  text: text(CARD_TEXT_MAX),
  place: text(160),
  eventId: optional(z.string().max(64)).default(null),
  time: text(60),
  venue: text(160),
  showReplyBy: z.boolean().default(true),
  showWebsiteLink: z.boolean().default(false),
});

const cardSchema = z.object({
  themeId: z.string().min(1).max(64),
  paletteId: optional(z.string().max(64)).default(null),
  fontPairingId: optional(z.string().max(64)).default(null),
  layoutId: optional(z.string().max(64)).default(null),
  envelope: z.boolean().default(true),
  photoKey: optional(imageKey).default(null),
  content: contentSchema,
  message: optional(z.string().trim().max(MESSAGE_MAX, "too_long")).default(null),
  reminderDays: z
    .array(z.number().int().min(0, "invalid_option").max(MAX_REMINDER_DAYS, "invalid_option"))
    .default([])
    .transform((days) => [...new Set(days)].sort((a, b) => b - a))
    .refine((days) => days.length <= MAX_REMINDERS, "too_many"),
  reminderMessage: optional(z.string().trim().max(MESSAGE_MAX, "too_long")).default(null),
});
export type CardInput = z.infer<typeof cardSchema>;

export function parseCardInput(input: unknown): Parsed<CardInput> {
  return parseWith(cardSchema, input);
}

/** `{name}` in the couple's texts becomes the household's name. */
export function personalize(message: string, householdName: string): string {
  return message.replaceAll("{name}", householdName);
}

// ---- the card as it is drawn ----

export type CardLabels = {
  locale: string;
  eyebrow: Record<CardKind, string>;
  /** "{date}" is replaced. */
  replyBy: string;
  /** "{time}" is replaced. */
  time: string;
};

export type CardDesign = ResolvedDesign & { layout: CardLayout };

/** Everything CardView draws, resolved: the same model renders the page, the preview, the email image and the exports. */
export type CardModel = {
  kind: CardKind;
  layout: CardLayout;
  colors: Palette["colors"] & { card: string; onCard: string; onCardMuted: string };
  fonts: FontPairing;
  photoSrc: string | null;
  maskSrc: string | null;
  ornamentSrc: string | null;
  eyebrow: string;
  heading: string;
  names: string;
  details: string[];
  text: string;
  personalLine: string | null;
  footer: string | null;
};

/** The photo's URL (or data URI) and the layout's SVG mask and ornament as markup from the theme. */
export type CardAssets = { photoSrc: string | null; maskSvg: string | null; ornamentSvg: string | null };

/** The colour of eyebrow, ornament, border and footer: the palette's accent, or the text colour on dark cards. */
export function cardAccent(model: Pick<CardModel, "layout" | "colors" | "photoSrc">): string {
  return (model.layout.photo === "full" && model.photoSrc) || model.layout.surface === "primary" ? model.colors.onCard : model.colors.accent;
}

const formatDate = (iso: string, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function cardColors(colors: Palette["colors"], layout: CardLayout, hasPhoto: boolean): CardModel["colors"] {
  if (layout.photo === "full" && hasPhoto) return { ...colors, card: colors.text, onCard: "#ffffff", onCardMuted: "#f1f1f1" };
  if (layout.surface === "primary") return { ...colors, card: colors.primary, onCard: colors.background, onCardMuted: colors.background };
  return { ...colors, card: colors[layout.surface], onCard: colors.text, onCardMuted: colors.muted };
}

export function buildCardModel(input: {
  kind: CardKind;
  content: CardContent;
  design: CardDesign;
  website: { title: string; weddingDate: string | null; location: string | null; url: string };
  event: { startDate: string; startTime: string; venueName: string } | null;
  replyBy: string | null;
  household: { name: string; personalLine: string } | null;
  labels: CardLabels;
  assets: CardAssets;
}): CardModel {
  const { kind, content, design, website, event, labels, assets } = input;
  const hasPhoto = !!assets.photoSrc && design.layout.photo !== "none";
  const date = (iso: string | null) => (iso ? formatDate(iso, labels.locale) : null);
  const details: (string | null)[] = [];
  let footer: string | null = null;
  if (kind === "saveTheDate") details.push(date(website.weddingDate), content.place || null);
  if (kind === "invitation") {
    details.push(date(event?.startDate ?? website.weddingDate));
    details.push(content.time || (event?.startTime ? labels.time.replace("{time}", event.startTime) : null));
    details.push(content.venue || event?.venueName || null);
    if (content.showReplyBy && input.replyBy) footer = labels.replyBy.replace("{date}", formatDate(input.replyBy, labels.locale));
  }
  if (kind === "engagement" && content.showWebsiteLink) footer = website.url.replace(/^https?:\/\//, "");
  const colors = cardColors(design.palette.colors, design.layout, hasPhoto);
  const photoSrc = hasPhoto ? assets.photoSrc : null;
  return {
    kind,
    layout: design.layout,
    colors,
    fonts: design.fonts,
    photoSrc,
    maskSrc: design.layout.photo === "masked" && assets.maskSvg ? svgDataUri(assets.maskSvg) : null,
    ornamentSrc: assets.ornamentSvg ? tintSvg(assets.ornamentSvg, cardAccent({ layout: design.layout, colors, photoSrc })) : null,
    eyebrow: labels.eyebrow[kind],
    heading: kind === "saveTheDate" ? "" : content.heading,
    names: content.names,
    details: details.filter((d): d is string => !!d),
    text: content.text,
    personalLine: kind === "thankYou" && input.household?.personalLine ? input.household.personalLine : null,
    footer,
  };
}

/** An SVG as a base64 data URI (works in browsers and in the exporter, which never fetches anything). */
export function svgDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** A theme's single-colour SVG ornament in the given colour. */
export function tintSvg(svg: string, color: string): string {
  return svgDataUri(svg.replace(/<svg\s/, `<svg fill="${color}" `));
}

// ---- deliveries: one card to one household ----

export type SharedVia = "whatsapp" | "link";

export type Delivery = {
  /** The couple left this household out of this card. */
  excluded: boolean;
  /** When the couple first shared it by WhatsApp or copied link. */
  sharedAt: Date | null;
  sharedVia: SharedVia | null;
  emailQueuedAt: Date | null;
  emailedAt: Date | null;
  emailError: string | null;
  /** First time the household's own page showed the card. */
  openedAt: Date | null;
  /** Smallest automatic-reminder offset (days before reply-by) already handled. */
  reminderOffset: number | null;
  reminderQueuedAt: Date | null;
  remindedAt: Date | null;
  reminderError: string | null;
};

export type DeliveryStatus = "excluded" | "notSent" | "queued" | "failed" | "sent" | "opened";

/** When a card first went to a household, by any channel. */
export function sentAt(delivery: Delivery | null): Date | null {
  if (!delivery) return null;
  const times = [delivery.sharedAt, delivery.emailedAt].filter((d): d is Date => !!d);
  return times.length ? new Date(Math.min(...times.map((d) => d.getTime()))) : null;
}

export function deliveryStatus(delivery: Delivery | null): DeliveryStatus {
  if (!delivery) return "notSent";
  if (delivery.excluded) return "excluded";
  if (delivery.openedAt) return "opened";
  if (sentAt(delivery)) return "sent";
  if (delivery.emailQueuedAt) return "queued";
  if (delivery.emailError) return "failed";
  return "notSent";
}

/** "23 von 31 Haushalten geöffnet": households the card is meant for, sent to, and opened by. */
export function cardCounts(deliveries: readonly (Delivery | null)[]): { households: number; sent: number; opened: number } {
  const meant = deliveries.filter((d) => !d?.excluded);
  return { households: meant.length, sent: meant.filter((d) => sentAt(d)).length, opened: meant.filter((d) => d?.openedAt).length };
}

/** "Send to all": households with an address that have not had this card yet and are not queued. */
export function emailRecipients<H extends { email: string | null; delivery: Delivery | null }>(households: readonly H[]): H[] {
  return households.filter((h) => h.email && !h.delivery?.excluded && !sentAt(h.delivery) && !h.delivery?.emailQueuedAt);
}

/**
 * Which cards a household's page shows, newest first, and whether the response form is on it. The form
 * comes with the invitation; without an (active) invitation card, the page is the v3 response page.
 */
export function householdPageContent(input: {
  cards: readonly { kind: HouseholdCardKind; active: boolean; delivery: Delivery | null }[];
  rsvpActive: boolean;
}): { kinds: HouseholdCardKind[]; form: boolean } {
  const order: HouseholdCardKind[] = ["thankYou", "invitation", "saveTheDate"];
  const shown = input.cards
    .filter((c) => c.active && c.delivery && !c.delivery.excluded && sentAt(c.delivery))
    .sort((a, b) => sentAt(b.delivery)!.getTime() - sentAt(a.delivery)!.getTime() || order.indexOf(a.kind) - order.indexOf(b.kind))
    .map((c) => c.kind);
  const invitationOffered = input.cards.some((c) => c.kind === "invitation" && c.active);
  return { kinds: shown, form: input.rsvpActive && (!invitationOffered || shown.includes("invitation")) };
}

// ---- reminders ----

const localDay = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/**
 * The automatic reminder due now, as its offset in days before the reply-by date, or null. Days count in
 * the website's timezone. Only offsets smaller than the last one handled count, so each goes out once; when
 * several are due, only the latest is sent. An invitation sent on or after a reminder day skips that reminder.
 */
export function reminderDue(input: { replyBy: string | null; days: readonly number[]; lastOffset: number | null; sentAt: Date; timeZone: string; now: Date }): number | null {
  if (!input.replyBy) return null;
  const today = dayNumber(localDay(input.now, input.timeZone));
  const sentDay = dayNumber(localDay(input.sentAt, input.timeZone));
  const replyBy = dayNumber(input.replyBy);
  if (today > replyBy) return null;
  const due = input.days.filter((d) => replyBy - d <= today && replyBy - d > sentDay && (input.lastOffset === null || d < input.lastOffset));
  return due.length ? Math.min(...due) : null;
}
