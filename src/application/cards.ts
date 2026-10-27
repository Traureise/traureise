import {
  buildCardModel,
  CARD_FEATURES,
  CARD_SLUGS,
  DEFAULT_REMINDER_DAYS,
  defaultCardContent,
  emailRecipients,
  isHouseholdCardKind,
  parseCardInput,
  personalize,
  reminderDue,
  sentAt,
  type CardDesign,
  type CardKind,
  type CardLabels,
  type CardModel,
  type HouseholdCardKind,
  type SharedVia,
} from "@/domain/cards";
import { findFontPairing } from "@/domain/fonts";
import { householdEmails, householdStatus, isReplyOpen, type Household } from "@/domain/guests";
import { uploadPath } from "@/domain/images";
import { cardLayoutsFor, resolveDesign, type CardLayout, type ResolvedDesign, type ThemeManifest } from "@/domain/theme";
import { firstVersion, needsDate, VERSION_FEATURES } from "@/domain/weddings";
import type { Deps } from "./deps";
import { LockedError, NotFoundError, ValidationError } from "./errors";
import { formFor, householdContent, householdDesign, linkUrl, loadByToken, loadGuestContext, type GuestContext, type GuestForm } from "./guest-context";
import { assertOwnImage, loadCardVersion, loadWedding } from "./owned";
import type { Card, MailMessage, NewCard, PaperFormat, QueuedMail, Website, Wedding } from "./ports";

const PNG_EXPORT_WIDTH = 1748; // A5 width at 300 dpi
const EMAIL_IMAGE_WIDTH = 900;
const EMAIL_IMAGE_CID = "karte";
/** A claim older than this never finished (the instance stopped mid-send): it becomes a failure, never a retry. */
const STALE_CLAIM_MS = 15 * 60_000;
const MAX_MAILS_PER_RUN = 1000;

/** Used when no theme has a layout for a kind (a self-hoster removed the bundled themes). */
const FALLBACK_LAYOUT: CardLayout = { id: "standard", name: { de: "Standard" }, photo: "rect", align: "center", surface: "background", border: false, headingCase: "normal" };

// ---- design and model ----

type DesignChoice = Pick<Card, "themeId" | "paletteId" | "fontPairingId" | "layoutId">;

/** The theme with layouts for this kind: the chosen one, else the default theme, else any. */
function cardTheme(deps: Deps, themeId: string, kind: CardKind): ThemeManifest {
  const usable = (t: ThemeManifest | undefined) => (t && cardLayoutsFor(t, kind).length > 0 ? t : undefined);
  return usable(deps.themes.get(themeId)) ?? usable(deps.themes.get(deps.themes.defaultThemeId())) ?? deps.themes.list().find(usable) ?? deps.themes.get(deps.themes.defaultThemeId())!;
}

function cardDesign(deps: Deps, choice: DesignChoice, kind: CardKind): CardDesign {
  const theme = cardTheme(deps, choice.themeId, kind);
  const layouts = cardLayoutsFor(theme, kind);
  return { ...resolveDesign(theme, choice.paletteId, choice.fontPairingId), layout: layouts.find((l) => l.id === choice.layoutId) ?? layouts[0] ?? FALLBACK_LAYOUT };
}

/** The website version's public address, or null while it is not online. */
export const siteUrl = (deps: Deps, ctx: GuestContext, website: Website | null) => (website && ctx.online(website) ? `${deps.appUrl}/${website.slug}` : null);

/** Builds what CardView draws. `photoSrc` is a URL on the page; for the exporter any non-null marker (the bytes come separately). */
function modelFor(deps: Deps, ctx: GuestContext, card: Card, household: Pick<Household, "name" | "personalLine"> | null, photoSrc: string | null): CardModel {
  const design = cardDesign(deps, card, card.kind);
  const { wedding } = ctx;
  const event = ctx.eventItems.find((i) => i.id === card.content.eventId);
  const svg = (file: string | undefined) => (file ? deps.themes.readSvg(design.theme.id, file) : null);
  return buildCardModel({
    kind: card.kind,
    content: card.content,
    design,
    website: { title: wedding.title, weddingDate: wedding.weddingDate, location: wedding.location },
    event: event ? { startDate: event.data.startDate, startTime: event.data.startTime, venueName: event.data.venueName } : null,
    replyBy: ctx.settings.replyBy,
    household,
    labels: deps.cardTexts.labels,
    assets: { photoSrc, maskSvg: svg(design.layout.photoMask), ornamentSvg: svg(design.layout.ornament) },
  });
}

const pagePhoto = (card: Card) => (card.photoKey ? uploadPath(card.photoKey) : null);

/** A card version as the home screen and the guest list show it (no household). */
export const cardPreview = (deps: Deps, ctx: GuestContext, card: Card): CardModel => modelFor(deps, ctx, card, null, pagePhoto(card));

async function photoBytes(deps: Deps, card: Card): Promise<Uint8Array | null> {
  return card.photoKey ? ((await deps.storage.get(card.photoKey))?.bytes ?? null) : null;
}

async function loadCard(deps: Deps, userId: string, cardId: string) {
  const { wedding, card } = await loadCardVersion(deps, userId, cardId);
  return { wedding, card, ctx: await loadGuestContext(deps, wedding) };
}

const cardMessage = (deps: Deps, card: Card) => card.message ?? deps.cardTexts.defaults[card.kind].message;
const reminderMessage = (deps: Deps, card: Card | null) => card?.reminderMessage ?? deps.cardTexts.reminderMessage;

/** Save the Date and invitation are about the day: they wait until the wedding has a date. */
function assertDate(wedding: Wedding, kind: CardKind) {
  if (needsDate(kind) && !wedding.weddingDate) throw new ValidationError({ _: "no_date" });
}

/** The first version of a card kind, made from the wedding's details and the first website's design. */
export function newCardVersion(deps: Deps, wedding: Wedding, website: Pick<Website, "themeId" | "paletteId" | "fontPairingId" | "coverImageKey"> | null, kind: CardKind, mainEventId: string | null): NewCard {
  const themeId = website?.themeId ?? deps.themes.defaultThemeId();
  const theme = cardTheme(deps, themeId, kind);
  const sameTheme = theme.id === themeId;
  return {
    weddingId: wedding.id,
    kind,
    label: deps.cardTexts.firstVersionLabel,
    slug: "standard",
    position: 0,
    themeId: theme.id,
    paletteId: sameTheme ? (website?.paletteId ?? null) : null,
    fontPairingId: sameTheme ? (website?.fontPairingId ?? null) : null,
    layoutId: cardLayoutsFor(theme, kind)[0]?.id ?? null,
    envelope: true,
    photoKey: website?.coverImageKey ?? null,
    content: { ...defaultCardContent(kind, wedding, deps.cardTexts.defaults[kind]), eventId: kind === "invitation" ? mainEventId : null },
    message: null,
    reminderDays: kind === "invitation" ? [...DEFAULT_REMINDER_DAYS] : [],
    reminderMessage: null,
  };
}

// ---- the couple: creating and designing ----

export type CardThemeOption = { id: string; theme: ThemeManifest; layouts: CardLayout[]; /** Mask and ornament markup per file, for the live preview. */ svgs: Record<string, string> };

export type CardEditor = {
  wedding: Wedding;
  card: Card;
  /** The kind's versions, first first. */
  versions: { id: string; label: string }[];
  themes: CardThemeOption[];
  /** Schedule items an invitation can show. */
  events: { id: string; name: string; startDate: string; startTime: string; venueName: string }[];
  replyBy: string | null;
  /** Save the Date and invitation: some households' website versions are not online, so their cards have no website link. */
  offlineWebsites: boolean;
  /** Save the Date and invitation without a wedding date: sending waits for one. */
  waitsForDate: boolean;
  /** "+ Version" is unlocked (canUse). */
  canAddVersion: boolean;
  /** The engagement version's public link. */
  publicUrl: string | null;
  /** Links, export and sending are unlocked. */
  active: boolean;
  billingEnabled: boolean;
  defaultMessage: string;
  defaultReminderMessage: string;
  /** For the live preview, which builds the card in the browser with the same rules. */
  labels: CardLabels;
};

export class GetCardEditor {
  constructor(private deps: Deps) {}

  async execute(userId: string, cardId: string): Promise<CardEditor> {
    const { wedding, ctx, card } = await loadCard(this.deps, userId, cardId);
    const { kind } = card;
    const themes = this.deps.themes
      .list()
      .map((theme) => ({ theme, layouts: cardLayoutsFor(theme, kind) }))
      .filter((t) => t.layouts.length > 0)
      .map(({ theme, layouts }) => {
        const files = [...new Set(layouts.flatMap((l) => [l.photoMask, l.ornament]).filter((f): f is string => !!f))];
        const svgs = Object.fromEntries(files.flatMap((file) => {
          const svg = this.deps.themes.readSvg(theme.id, file);
          return svg ? [[file, svg]] : [];
        }));
        return { id: theme.id, theme, layouts, svgs };
      });
    return {
      wedding,
      card,
      versions: ctx.versionsOf(kind).map(({ id, label }) => ({ id, label })),
      themes,
      events: ctx.eventItems.map((i) => ({ id: i.id, name: i.data.name, startDate: i.data.startDate, startTime: i.data.startTime, venueName: i.data.venueName })),
      replyBy: ctx.settings.replyBy,
      offlineWebsites: LINKS_WEBSITE.includes(kind) && ctx.websites.some((w) => !ctx.online(w)),
      waitsForDate: needsDate(kind) && !wedding.weddingDate,
      canAddVersion: ctx.can(VERSION_FEATURES[kind]),
      publicUrl: kind === "engagement" ? engagementUrl(this.deps, wedding, card, ctx.versionsOf(kind)) : null,
      active: ctx.cardActive(kind),
      billingEnabled: this.deps.billing.enabled,
      defaultMessage: this.deps.cardTexts.defaults[kind].message,
      defaultReminderMessage: this.deps.cardTexts.reminderMessage,
      labels: this.deps.cardTexts.labels,
    };
  }
}

export class SaveCard {
  constructor(private deps: Deps) {}

  async execute(userId: string, cardId: string, input: unknown): Promise<void> {
    const { ctx, card, wedding } = await loadCard(this.deps, userId, cardId);
    const { kind } = card;
    const parsed = parseCardInput(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const value = parsed.value;
    const theme = this.deps.themes.get(value.themeId);
    const layouts = theme ? cardLayoutsFor(theme, kind) : [];
    if (!theme || layouts.length === 0) throw new ValidationError({ themeId: "invalid_option" });
    if (value.layoutId && !layouts.some((l) => l.id === value.layoutId)) throw new ValidationError({ layoutId: "invalid_option" });
    if (value.paletteId && !theme.palettes.some((p) => p.id === value.paletteId)) throw new ValidationError({ paletteId: "invalid_option" });
    if (value.fontPairingId && !findFontPairing(value.fontPairingId)) throw new ValidationError({ fontPairingId: "invalid_option" });
    if (value.content.eventId && !ctx.eventItems.some((i) => i.id === value.content.eventId)) throw new ValidationError({ "content.eventId": "invalid_option" });
    await assertOwnImage(this.deps, wedding.id, value.photoKey, "photoKey");
    await this.deps.cards.update(cardId, { ...value, layoutId: value.layoutId ?? layouts[0]!.id, reminderDays: kind === "invitation" ? value.reminderDays : [] });
  }
}

export type ExportFormat = "png" | PaperFormat;

export class ExportCard {
  constructor(private deps: Deps) {}

  /** PNG for messengers, PDF in A6 or A5 for printing at home. Needs the card's tier. */
  async execute(userId: string, cardId: string, format: ExportFormat): Promise<{ filename: string; contentType: string; bytes: Uint8Array }> {
    const { ctx, card, wedding } = await loadCard(this.deps, userId, cardId);
    const { kind } = card;
    if (!ctx.cardActive(kind)) throw new LockedError();
    assertDate(wedding, kind);
    const photo = await photoBytes(this.deps, card);
    const model = modelFor(this.deps, ctx, card, null, photo ? "photo" : null);
    const name = card.position === firstVersion(ctx.versionsOf(kind))?.position ? CARD_SLUGS[kind] : `${CARD_SLUGS[kind]}-${card.slug}`;
    if (format === "png") return { filename: `${name}.png`, contentType: "image/png", bytes: await this.deps.cardRenderer.png(model, photo, PNG_EXPORT_WIDTH) };
    return { filename: `${name}-${format}.pdf`, contentType: "application/pdf", bytes: await this.deps.cardRenderer.pdf(model, photo, format) };
  }
}

// ---- the guests' side: the household page ----

export type PageCard = { kind: CardKind; label: string; model: CardModel; envelope: boolean; icsUrl: string | null; websiteUrl: string | null };
type PageWebsite = Pick<Wedding, "title" | "slug" | "weddingDate" | "timezone">;

export type HouseholdPageView =
  | {
      state: "page";
      website: PageWebsite;
      design: ResolvedDesign;
      /** The household's name on the envelope; null for a general greeting. */
      greeting: string | null;
      /** Open with the envelope (the newest card's setting). */
      envelope: boolean;
      cards: PageCard[];
      form: GuestForm | null;
    }
  | { state: "inactive"; website: PageWebsite; design: ResolvedDesign };

const pageWebsite = ({ title, slug, weddingDate, timezone }: Wedding): PageWebsite => ({ title, slug, weddingDate, timezone });

/** Save the Date and invitation link the website: the household's version, once it is online. */
const LINKS_WEBSITE: readonly CardKind[] = ["saveTheDate", "invitation"];

/** A card as a page shows it. */
function pageCard(deps: Deps, ctx: GuestContext, card: Card, household: (Pick<Household, "name" | "personalLine"> & { id: string }) | null): PageCard {
  const { slug, weddingDate } = ctx.wedding;
  const website = LINKS_WEBSITE.includes(card.kind) ? (household ? ctx.websiteFor(household.id) : ctx.firstWebsite()) : null;
  return {
    kind: card.kind,
    label: card.label,
    model: modelFor(deps, ctx, card, household, pagePhoto(card)),
    envelope: card.envelope,
    icsUrl: card.kind === "saveTheDate" && weddingDate ? `/${slug}/hochzeit.ics` : null,
    websiteUrl: website && ctx.online(website) ? `/${website.slug}` : null,
  };
}

export class GetHouseholdPage {
  constructor(private deps: Deps) {}

  /**
   * The household's page behind its personal link: the cards sent to it (its assigned versions), newest first,
   * and the response form with the invitation. Without cards it is the v3 response page. Null for unknown links;
   * an inactive link reveals nothing about the household.
   */
  async execute(token: string): Promise<HouseholdPageView | null> {
    const found = await loadByToken(this.deps, token);
    if (!found) return null;
    const { ctx, household, wedding } = found;
    const content = await householdContent(this.deps, ctx, household);
    const base = { website: pageWebsite(wedding), design: householdDesign(this.deps, ctx, household.id) };
    // Nothing to show only without active links (no package, or the guest data is gone).
    if (content.kinds.length === 0 && !content.form) return { ...base, state: "inactive" };
    const cards = content.kinds.map((kind) => pageCard(this.deps, ctx, ctx.cardFor(household.id, kind)!, household));
    return {
      ...base,
      state: "page",
      greeting: household.name,
      envelope: cards[0]?.envelope ?? false,
      cards,
      form: content.form ? formFor(this.deps, ctx, household, isReplyOpen(ctx.settings.replyBy, wedding.timezone, ctx.now) ? "open" : "closed") : null,
    };
  }
}

export class GetCardPreview {
  constructor(private deps: Deps) {}

  /** A card version as guests see it, for a household that gets it or a sample one. Free; it records nothing. */
  async execute(userId: string, cardId: string): Promise<Extract<HouseholdPageView, { state: "page" }>> {
    const { wedding, ctx, card } = await loadCard(this.deps, userId, cardId);
    const { kind } = card;
    const households = await this.deps.guests.listHouseholds(wedding.id);
    const first = isHouseholdCardKind(kind) ? households.find((h) => ctx.cardFor(h.id, kind)?.id === card.id) : undefined;
    const household: Household = first ?? {
      id: "preview",
      name: this.deps.cardTexts.sampleHousehold,
      invitedEventIds: null,
      message: "",
      pollAnswers: {},
      respondedAt: null,
      answeredBy: null,
      createdAt: ctx.now,
      personalLine: "",
      unsubscribedAt: null,
      requests: [],
      people: [],
    };
    return {
      state: "page",
      website: pageWebsite(wedding),
      design: householdDesign(this.deps, ctx, first?.id ?? null),
      greeting: household.name,
      envelope: card.envelope,
      cards: [pageCard(this.deps, ctx, card, household)],
      form: kind === "invitation" && household.people.length > 0 ? formFor(this.deps, ctx, household, "preview") : null,
    };
  }
}

export class MarkCardsOpened {
  constructor(private deps: Deps) {}

  /**
   * Called by the household's page once a card is actually shown (the envelope opened). Only the first time
   * counts, only for cards the page shows, per version. Returns the kinds recorded now.
   */
  async execute(token: string, kinds: readonly string[]): Promise<HouseholdCardKind[]> {
    const found = await loadByToken(this.deps, token);
    if (!found) return [];
    const { ctx, household } = found;
    const content = await householdContent(this.deps, ctx, household);
    const recorded: HouseholdCardKind[] = [];
    for (const kind of content.kinds.filter((k) => kinds.includes(k))) {
      const card = ctx.cardFor(household.id, kind)!;
      if (await this.deps.cards.markOpened(card.id, household.id, ctx.now)) recorded.push(kind);
    }
    return recorded;
  }
}

export type EngagementPage =
  | { state: "active"; website: PageWebsite; design: ResolvedDesign; card: PageCard }
  | { state: "inactive"; website: PageWebsite; design: ResolvedDesign };

/** A wedding by its own slug, or through one of its website versions' slugs. */
export async function weddingBySlug(deps: Deps, slug: string): Promise<Wedding | null> {
  const wedding = await deps.weddings.findBySlug(slug);
  if (wedding) return wedding;
  const website = await deps.websites.findBySlug(slug);
  return website ? deps.weddings.findById(website.weddingId) : null;
}

export class GetEngagementPage {
  constructor(private deps: Deps) {}

  /** An engagement version's shareable link: the first at /<slug>/verlobung, the others at /<slug>/verlobung/<version>. */
  async execute(slug: string, versionSlug?: string): Promise<EngagementPage | null> {
    const wedding = await weddingBySlug(this.deps, slug);
    if (!wedding) return null;
    const ctx = await loadGuestContext(this.deps, wedding);
    const versions = ctx.versionsOf("engagement");
    const card = versionSlug ? versions.find((c) => c.slug === versionSlug && c.id !== versions[0]?.id) : versions[0];
    if (!card) return null;
    const base = { website: pageWebsite(wedding), design: householdDesign(this.deps, ctx, null) };
    // The public link only needs the package; it is not guest data.
    if (!ctx.can(CARD_FEATURES.engagement)) return { ...base, state: "inactive" };
    return { ...base, state: "active", card: pageCard(this.deps, ctx, card, null) };
  }
}

/** The public link of an engagement version. */
export function engagementUrl(deps: Deps, wedding: Wedding, card: Card, versions: readonly Card[]): string {
  const base = `${deps.appUrl}/${wedding.slug}/${CARD_SLUGS.engagement}`;
  return firstVersion(versions)?.id === card.id ? base : `${base}/${card.slug}`;
}

export class MarkEngagementShared {
  constructor(private deps: Deps) {}

  /** The couple copied the engagement link or opened WhatsApp with it: the timeline counts it as shared. */
  async execute(userId: string, cardId: string): Promise<void> {
    const { card, ctx } = await loadCard(this.deps, userId, cardId);
    if (card.kind !== "engagement") throw new NotFoundError();
    if (!ctx.can(CARD_FEATURES.engagement)) throw new LockedError();
    await this.deps.cards.markLinkShared(card.id, ctx.now);
  }
}

// ---- the couple: sending ----

async function loadHouseholdCard(deps: Deps, userId: string, weddingId: string, kind: CardKind, householdId: string) {
  if (!isHouseholdCardKind(kind)) throw new NotFoundError();
  const wedding = await loadWedding(deps, userId, weddingId);
  const ctx = await loadGuestContext(deps, wedding);
  const household = await deps.guests.findHousehold(weddingId, householdId);
  const card = household && ctx.cardFor(household.id, kind);
  if (!household || !card) throw new NotFoundError();
  const delivery = (await deps.cards.listDeliveriesOfHousehold(householdId)).find((d) => d.kind === kind) ?? null;
  return { wedding, ctx, card, household, kind, delivery };
}

export class ShareCard {
  constructor(private deps: Deps) {}

  /** The couple shares a card by WhatsApp or copied link: records it and returns the link and the household's version's text. */
  async execute(userId: string, weddingId: string, kind: CardKind, householdId: string, via: SharedVia): Promise<{ link: string; message: string }> {
    const loaded = await loadHouseholdCard(this.deps, userId, weddingId, kind, householdId);
    const { ctx, card, household, delivery, wedding } = loaded;
    if (!ctx.cardActive(kind)) throw new LockedError();
    assertDate(wedding, kind);
    if (delivery?.excluded) throw new ValidationError({ _: "excluded" });
    await this.deps.cards.markShared(householdId, loaded.kind, via, ctx.now);
    return { link: linkUrl(this.deps, householdId), message: personalize(cardMessage(this.deps, card), household.name) };
  }
}

export class MarkCardsSent {
  constructor(private deps: Deps) {}

  /**
   * "Als gesendet markieren": the couple sent a card outside the app (WhatsApp on the phone, in person, by post).
   * It counts as sent, so the household's page shows it and the timeline moves on. "all" marks every household it
   * is meant for that has not had it yet. `sent: false` undoes a hand mark, never a real send.
   */
  async execute(userId: string, weddingId: string, kind: CardKind, target: SendTarget, sent: boolean): Promise<{ marked: number }> {
    if (!isHouseholdCardKind(kind)) throw new NotFoundError();
    const wedding = await loadWedding(this.deps, userId, weddingId);
    const ctx = await loadGuestContext(this.deps, wedding);
    const households = await this.deps.guests.listHouseholds(weddingId);
    const ids = target === "all" ? households.map((h) => h.id) : households.filter((h) => h.id === target.householdId).map((h) => h.id);
    if (target !== "all" && ids.length === 0) throw new NotFoundError();
    if (!sent) {
      if (target === "all") throw new ValidationError({ _: "invalid_option" });
      if (!(await this.deps.cards.unmarkShared(ids[0]!, kind))) throw new ValidationError({ _: "not_manual" });
      return { marked: 1 };
    }
    if (!ctx.cardActive(kind)) throw new LockedError();
    assertDate(wedding, kind);
    const deliveries = (await this.deps.cards.listDeliveries(weddingId)).filter((d) => d.kind === kind);
    const open = ids.filter((id) => {
      const d = deliveries.find((x) => x.householdId === id);
      return !d?.excluded && !sentAt(d ? { ...d, openedAt: null } : null);
    });
    if (target !== "all" && open.length === 0) throw new ValidationError({ _: deliveries.find((d) => d.householdId === ids[0])?.excluded ? "excluded" : "already_sent" });
    for (const id of open) await this.deps.cards.markShared(id, kind, "manual", ctx.now);
    return { marked: open.length };
  }
}

export class SetCardExcluded {
  constructor(private deps: Deps) {}

  /** Leaves a household out of a card (or back in). Every household gets every card by default. */
  async execute(userId: string, weddingId: string, kind: CardKind, householdId: string, excluded: boolean): Promise<void> {
    const loaded = await loadHouseholdCard(this.deps, userId, weddingId, kind, householdId);
    await this.deps.cards.setExcluded(householdId, loaded.kind, excluded);
  }
}

export type SendTarget = { householdId: string } | "all";

export class SendCardEmails {
  constructor(private deps: Deps) {}

  /**
   * Queues the card's email for one household (again, if asked) or for every household with an address that
   * has not had any version of it yet. The background job sends each household its assigned version.
   */
  async execute(userId: string, weddingId: string, kind: CardKind, target: SendTarget): Promise<{ queued: number }> {
    if (!isHouseholdCardKind(kind)) throw new NotFoundError();
    const wedding = await loadWedding(this.deps, userId, weddingId);
    const ctx = await loadGuestContext(this.deps, wedding);
    if (!ctx.cardActive(kind) || !ctx.can("emailSending")) throw new LockedError();
    assertDate(wedding, kind);
    const deliveries = (await this.deps.cards.listDeliveries(weddingId)).filter((d) => d.kind === kind);
    const households = (await this.deps.guests.listHouseholds(weddingId)).map((h) => ({ ...h, delivery: deliveries.find((d) => d.householdId === h.id) ?? null }));
    let ids: string[];
    if (target === "all") ids = emailRecipients(households.map((h) => ({ ...h, delivery: h.delivery && { ...h.delivery, openedAt: null } }))).map((h) => h.id);
    else {
      const household = households.find((h) => h.id === target.householdId);
      if (!household) throw new NotFoundError();
      if (householdEmails(household).length === 0) throw new ValidationError({ email: "no_email" });
      if (household.delivery?.excluded) throw new ValidationError({ _: "excluded" });
      ids = [household.id];
    }
    return { queued: ids.length ? await this.deps.cards.queueMail("card", kind, ids, ctx.now) : 0 };
  }
}

export class SendReminders {
  constructor(private deps: Deps) {}

  /**
   * "Erinnerung senden" for one household or every open one: an email where there is an address (Einladungen
   * tier), otherwise the text and link for the couple to open in WhatsApp (RSVP tier). The text is the household's invitation version's.
   */
  async execute(userId: string, weddingId: string, target: SendTarget): Promise<{ queued: number; whatsapp: { householdId: string; name: string; message: string; link: string }[] }> {
    const wedding = await loadWedding(this.deps, userId, weddingId);
    const ctx = await loadGuestContext(this.deps, wedding);
    const byEmail = ctx.can("emailReminders");
    if (!ctx.sending && !byEmail) throw new LockedError();
    // Reminders are about answering: they stop at the reply-by date and for households that answered.
    if (!isReplyOpen(ctx.settings.replyBy, wedding.timezone, ctx.now)) throw new ValidationError({ _: "closed" });
    const deliveries = (await this.deps.cards.listDeliveries(weddingId)).filter((d) => d.kind === "invitation");
    const all = await this.deps.guests.listHouseholds(weddingId);
    const chosen = target === "all" ? all.filter((h) => householdStatus(h) === "open") : all.filter((h) => h.id === target.householdId);
    if (target !== "all" && chosen.length === 0) throw new NotFoundError();
    if (target !== "all" && householdStatus(chosen[0]!) !== "open") throw new ValidationError({ _: "answered" });
    const households = chosen.filter((h) => !deliveries.find((d) => d.householdId === h.id)?.excluded);
    const emailIds = byEmail && ctx.versionsOf("invitation").length > 0 ? households.filter((h) => householdEmails(h).length > 0).map((h) => h.id) : [];
    const queued = emailIds.length ? await this.deps.cards.queueMail("reminder", "invitation", emailIds, ctx.now) : 0;
    const whatsapp = ctx.sending
      ? households
          .filter((h) => !emailIds.includes(h.id))
          .map((h) => ({ householdId: h.id, name: h.name, message: reminderMessage(this.deps, ctx.cardFor(h.id, "invitation")), link: linkUrl(this.deps, h.id) }))
      : [];
    return { queued, whatsapp };
  }
}

// ---- the background job ----

export type MailJobsResult = { sent: number; failed: number; reminders: number };

/**
 * Sends queued card emails and reminders, and the automatic reminders. Safe on several instances: every email
 * is claimed first (compare-and-set), and a claim that never finished becomes a failure, so nothing goes out
 * twice. Paced by `mailRate` so a large send does not flood the SMTP server.
 */
export class RunMailJobs {
  private contexts = new Map<string, Promise<GuestContext | null>>();
  private images = new Map<string, Promise<Uint8Array>>();

  constructor(private deps: Deps) {}

  /** `automatic: false` sends only what is queued (the run started right after the couple clicked). */
  async execute(options: { weddingId?: string; automatic?: boolean } = {}): Promise<MailJobsResult> {
    this.contexts.clear();
    this.images.clear();
    const result: MailJobsResult = { sent: 0, failed: 0, reminders: 0 };
    const now = this.deps.clock.now();
    await this.deps.cards.failStaleClaims(new Date(now.getTime() - STALE_CLAIM_MS));

    let handled = 0;
    while (handled < MAX_MAILS_PER_RUN) {
      const batch = await this.deps.cards.listQueuedMail(this.deps.mailRate.batchSize, options.weddingId);
      if (batch.length === 0) break;
      let claimed = 0;
      for (const queued of batch) {
        if (!(await this.deps.cards.claimMail(queued.channel, queued.householdId, queued.kind, this.deps.clock.now()))) continue;
        claimed++;
        handled++;
        const outcome = await this.sendQueued(queued);
        await this.deps.cards.finishMail(queued.channel, queued.householdId, queued.kind, outcome === "sent" ? { sentAt: this.deps.clock.now() } : { error: outcome });
        if (outcome === "sent") result.sent++;
        else result.failed++;
        await this.pause();
      }
      if (claimed === 0) break;
    }

    if (options.automatic === false) return result;
    for (const weddingId of await this.deps.cards.listWeddingIdsWithReminders()) {
      if (options.weddingId && weddingId !== options.weddingId) continue;
      const outcome = await this.automaticReminders(weddingId).catch((error) => {
        console.error(`[traureise] automatic reminders failed for ${weddingId}`, error);
        return { sent: 0, failed: 0 };
      });
      result.reminders += outcome.sent;
      result.failed += outcome.failed;
    }
    return result;
  }

  private pause() {
    const ms = this.deps.mailRate.intervalMs;
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  }

  private context(weddingId: string): Promise<GuestContext | null> {
    let ctx = this.contexts.get(weddingId);
    if (!ctx) {
      ctx = this.deps.weddings.findById(weddingId).then((w) => (w ? loadGuestContext(this.deps, w) : null));
      this.contexts.set(weddingId, ctx);
    }
    return ctx;
  }

  /** Each household gets the version assigned to it when the email goes out. */
  private async sendQueued(queued: QueuedMail): Promise<"sent" | string> {
    const ctx = await this.context(queued.weddingId);
    const household = ctx && (await this.deps.guests.findHousehold(queued.weddingId, queued.householdId));
    const card = household && ctx.cardFor(household.id, queued.kind);
    if (!ctx || !card || !household) return "gone";
    if (householdEmails(household).length === 0) return "no_email";
    if (queued.channel === "card" ? !ctx.cardActive(card.kind) || !ctx.can("emailSending") : !ctx.can("emailReminders")) return "locked";
    if (queued.channel === "card" && needsDate(card.kind) && !ctx.wedding.weddingDate) return "no_date";
    if (queued.channel === "reminder" && household.respondedAt) return "answered";
    if (queued.channel === "reminder" && !isReplyOpen(ctx.settings.replyBy, ctx.wedding.timezone, ctx.now)) return "closed";
    try {
      if (queued.channel === "reminder") await this.sendReminder(ctx, card, household);
      else await this.sendCard(ctx, card, household);
      return "sent";
    } catch (error) {
      console.error(`[traureise] sending ${queued.channel} email failed`, error);
      return "send_failed";
    }
  }

  /** One image per card; thank-you cards with a personal line get their own. */
  private image(ctx: GuestContext, card: Card, household: Household): Promise<Uint8Array> {
    const personal = card.kind === "thankYou" && household.personalLine;
    const key = personal ? `${card.id}:${household.id}` : card.id;
    let image = this.images.get(key);
    if (!image) {
      image = photoBytes(this.deps, card).then((photo) => this.deps.cardRenderer.png(modelFor(this.deps, ctx, card, household, photo ? "photo" : null), photo, EMAIL_IMAGE_WIDTH));
      image.catch(() => this.images.delete(key));
      this.images.set(key, image);
    }
    return image;
  }

  /** Sender, reply address and unsubscribe headers shared by every email to guests. */
  private async envelope(ctx: GuestContext, household: Household): Promise<Pick<MailMessage, "to" | "fromName" | "replyTo" | "headers">> {
    const contact = ctx.wedding.contactUserId ? await this.deps.users.findById(ctx.wedding.contactUserId) : null;
    const stop = this.deps.guestLinks.unsubscribeTokenFor(household.id);
    return {
      to: householdEmails(household),
      fromName: `${ctx.wedding.title} über Traureise`,
      replyTo: contact?.email,
      headers: { "List-Unsubscribe": `<${this.deps.appUrl}/api/abmelden/${stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    };
  }

  private links(household: Household) {
    return { pageUrl: linkUrl(this.deps, household.id), unsubscribeUrl: `${this.deps.appUrl}/abmelden/${this.deps.guestLinks.unsubscribeTokenFor(household.id)}` };
  }

  private async sendCard(ctx: GuestContext, card: Card, household: Household) {
    const image = await this.image(ctx, card, household);
    const mail = this.deps.cardMail.card({
      kind: card.kind,
      couple: ctx.wedding.title,
      household: household.name,
      message: personalize(cardMessage(this.deps, card), household.name),
      ...this.links(household),
      imageCid: EMAIL_IMAGE_CID,
    });
    await this.deps.mailer.send({
      ...(await this.envelope(ctx, household)),
      ...mail,
      attachments: [{ filename: `${CARD_SLUGS[card.kind]}.png`, content: image, contentType: "image/png", cid: EMAIL_IMAGE_CID }],
    });
  }

  private async sendReminder(ctx: GuestContext, card: Card, household: Household) {
    const replyBy = ctx.settings.replyBy;
    const mail = this.deps.cardMail.reminder({
      couple: ctx.wedding.title,
      household: household.name,
      message: personalize(reminderMessage(this.deps, card), household.name),
      ...this.links(household),
      replyBy: replyBy ? new Date(`${replyBy}T00:00:00Z`) : null,
    });
    await this.deps.mailer.send({ ...(await this.envelope(ctx, household)), ...mail });
  }

  private async automaticReminders(weddingId: string): Promise<{ sent: number; failed: number }> {
    const outcome = { sent: 0, failed: 0 };
    const ctx = await this.context(weddingId);
    if (!ctx || !ctx.can("emailReminders") || !ctx.cardActive("invitation")) return outcome;
    const deliveries = (await this.deps.cards.listDeliveries(weddingId)).filter((d) => d.kind === "invitation");
    for (const household of await this.deps.guests.listHouseholds(weddingId)) {
      const delivery = deliveries.find((d) => d.householdId === household.id);
      const sent = sentAt(delivery ? { ...delivery, openedAt: null } : null);
      // The days come from the household's invitation version.
      const card = ctx.cardFor(household.id, "invitation");
      if (!card || householdEmails(household).length === 0 || household.respondedAt || !delivery || delivery.excluded || !sent) continue;
      const offset = reminderDue({ replyBy: ctx.settings.replyBy, days: card.reminderDays, lastOffset: delivery.reminderOffset, sentAt: sent, timeZone: ctx.wedding.timezone, now: ctx.now });
      if (offset === null || !(await this.deps.cards.claimAutomaticReminder(household.id, offset, this.deps.clock.now()))) continue;
      try {
        await this.sendReminder(ctx, card, household);
        outcome.sent++;
      } catch (error) {
        console.error("[traureise] automatic reminder failed", error);
        outcome.failed++;
      }
      await this.pause();
    }
    return outcome;
  }
}

// ---- unsubscribing ----

async function householdOfUnsubscribe(deps: Deps, token: string) {
  const id = deps.guestLinks.verifyUnsubscribe(token);
  if (!id) return null;
  const found = await deps.guests.findByTokenHash(deps.guestLinks.hash(deps.guestLinks.tokenFor(id)));
  const wedding = found && (await deps.weddings.findById(found.weddingId));
  return found && wedding ? { household: found.household, wedding } : null;
}

export class GetUnsubscribe {
  constructor(private deps: Deps) {}

  /** What the unsubscribe page says: whose emails stop, and whether that already happened. */
  async execute(token: string): Promise<{ couple: string; household: string; done: boolean } | null> {
    const found = await householdOfUnsubscribe(this.deps, token);
    if (!found) return null;
    return { couple: found.wedding.title, household: found.household.name, done: householdEmails(found.household).length === 0 && !!found.household.unsubscribedAt };
  }
}

export class Unsubscribe {
  constructor(private deps: Deps) {}

  /** One click, no login: clears the household's address, so no more emails for this wedding. */
  async execute(token: string): Promise<boolean> {
    const found = await householdOfUnsubscribe(this.deps, token);
    if (!found) return false;
    return this.deps.guests.unsubscribe(found.household.id, this.deps.clock.now());
  }
}
