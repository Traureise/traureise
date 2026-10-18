import {
  buildCardModel,
  cardCounts,
  CARD_KINDS,
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
  type CardModel,
  type HouseholdCardKind,
  type SharedVia,
} from "@/domain/cards";
import { findFontPairing } from "@/domain/fonts";
import { householdStatus, isReplyOpen, whatsappUrl, type Household } from "@/domain/guests";
import { uploadPath } from "@/domain/images";
import { cardLayoutsFor, resolveDesign, type CardLayout, type ResolvedDesign, type ThemeManifest } from "@/domain/theme";
import type { Deps } from "./deps";
import { LockedError, NotFoundError, ValidationError } from "./errors";
import { formFor, householdContent, linkUrl, loadByToken, loadGuestContext, type GuestContext, type GuestForm } from "./guest-context";
import { assertOwnImage, loadOwnedWebsite } from "./owned";
import type { Card, MailMessage, PaperFormat, QueuedMail, Website } from "./ports";
import { itemsOf } from "./views";

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

/** Builds what CardView draws. `photoSrc` is a URL on the page; for the exporter any non-null marker (the bytes come separately). */
function modelFor(deps: Deps, ctx: GuestContext, card: Card, household: Pick<Household, "name" | "personalLine"> | null, photoSrc: string | null): CardModel {
  const design = cardDesign(deps, card, card.kind);
  const website = ctx.view.website;
  const schedule = itemsOf(ctx.view, "schedule").find((i) => i.id === card.content.eventId);
  const svg = (file: string | undefined) => (file ? deps.themes.readSvg(design.theme.id, file) : null);
  return buildCardModel({
    kind: card.kind,
    content: card.content,
    design,
    website: { title: website.title, weddingDate: website.weddingDate, location: website.location, url: `${deps.appUrl}/${website.slug}` },
    event: schedule ? { startDate: schedule.data.startDate, startTime: schedule.data.startTime, venueName: schedule.data.venueName } : null,
    replyBy: ctx.settings.replyBy,
    household,
    labels: deps.cardTexts.labels,
    assets: { photoSrc, maskSvg: svg(design.layout.photoMask), ornamentSvg: svg(design.layout.ornament) },
  });
}

const pagePhoto = (card: Card) => (card.photoKey ? uploadPath(card.photoKey) : null);

async function photoBytes(deps: Deps, card: Card): Promise<Uint8Array | null> {
  return card.photoKey ? ((await deps.storage.get(card.photoKey))?.bytes ?? null) : null;
}

async function loadOwnedCard(deps: Deps, userId: string, websiteId: string, kind: CardKind) {
  const website = await loadOwnedWebsite(deps, userId, websiteId);
  const ctx = await loadGuestContext(deps, website);
  const card = ctx.cards.find((c) => c.kind === kind);
  if (!card) throw new NotFoundError();
  return { website, ctx, card };
}

const cardMessage = (deps: Deps, card: Card) => card.message ?? deps.cardTexts.defaults[card.kind].message;
const reminderMessage = (deps: Deps, card: Card | undefined) => card?.reminderMessage ?? deps.cardTexts.reminderMessage;

// ---- the couple: creating and designing ----

export class CreateCard {
  constructor(private deps: Deps) {}

  /** Creates the website's card of this kind, or returns the existing one (one per kind). */
  async execute(userId: string, websiteId: string, kind: CardKind): Promise<Card> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const existing = await this.deps.cards.find(websiteId, kind);
    if (existing) return existing;
    const ctx = await loadGuestContext(this.deps, website);
    const theme = cardTheme(this.deps, website.themeId, kind);
    const sameTheme = theme.id === website.themeId;
    const schedule = itemsOf(ctx.view, "schedule");
    const main = schedule.find((i) => i.data.eventType === "ceremony" || i.data.eventType === "wedding") ?? schedule[0];
    const created = await this.deps.cards.create({
      websiteId,
      kind,
      themeId: theme.id,
      paletteId: sameTheme ? website.paletteId : null,
      fontPairingId: sameTheme ? website.fontPairingId : null,
      layoutId: cardLayoutsFor(theme, kind)[0]?.id ?? null,
      envelope: kind !== "engagement",
      photoKey: website.coverImageKey,
      content: { ...defaultCardContent(kind, website, this.deps.cardTexts.defaults[kind]), eventId: kind === "invitation" ? (main?.id ?? null) : null },
      message: null,
      reminderDays: kind === "invitation" ? [...DEFAULT_REMINDER_DAYS] : [],
      reminderMessage: null,
    });
    return created ?? (await this.deps.cards.find(websiteId, kind))!;
  }
}

export type CardThemeOption = { id: string; theme: ThemeManifest; layouts: CardLayout[]; /** Mask and ornament markup per file, for the live preview. */ svgs: Record<string, string> };

export type CardEditor = {
  website: Website;
  card: Card;
  themes: CardThemeOption[];
  /** Schedule items an invitation can show. */
  events: { id: string; name: string; startDate: string; startTime: string; venueName: string }[];
  replyBy: string | null;
  websiteUrl: string;
  /** Links, export and sending are unlocked. */
  active: boolean;
  billingEnabled: boolean;
  defaultMessage: string;
  defaultReminderMessage: string;
};

export class GetCardEditor {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, kind: CardKind): Promise<CardEditor> {
    const { website, ctx, card } = await loadOwnedCard(this.deps, userId, websiteId, kind);
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
      website,
      card,
      themes,
      events: itemsOf(ctx.view, "schedule").map((i) => ({ id: i.id, name: i.data.name, startDate: i.data.startDate, startTime: i.data.startTime, venueName: i.data.venueName })),
      replyBy: ctx.settings.replyBy,
      websiteUrl: `${this.deps.appUrl}/${website.slug}`,
      active: ctx.cardActive(kind),
      billingEnabled: this.deps.billing.enabled,
      defaultMessage: this.deps.cardTexts.defaults[kind].message,
      defaultReminderMessage: this.deps.cardTexts.reminderMessage,
    };
  }
}

export class SaveCard {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, kind: CardKind, input: unknown): Promise<void> {
    const { ctx } = await loadOwnedCard(this.deps, userId, websiteId, kind);
    const parsed = parseCardInput(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const value = parsed.value;
    const theme = this.deps.themes.get(value.themeId);
    const layouts = theme ? cardLayoutsFor(theme, kind) : [];
    if (!theme || layouts.length === 0) throw new ValidationError({ themeId: "invalid_option" });
    if (value.layoutId && !layouts.some((l) => l.id === value.layoutId)) throw new ValidationError({ layoutId: "invalid_option" });
    if (value.paletteId && !theme.palettes.some((p) => p.id === value.paletteId)) throw new ValidationError({ paletteId: "invalid_option" });
    if (value.fontPairingId && !findFontPairing(value.fontPairingId)) throw new ValidationError({ fontPairingId: "invalid_option" });
    if (value.content.eventId && !itemsOf(ctx.view, "schedule").some((i) => i.id === value.content.eventId)) throw new ValidationError({ "content.eventId": "invalid_option" });
    await assertOwnImage(this.deps, websiteId, value.photoKey, "photoKey");
    await this.deps.cards.update(websiteId, kind, { ...value, layoutId: value.layoutId ?? layouts[0]!.id, reminderDays: kind === "invitation" ? value.reminderDays : [] });
  }
}

export class DeleteCard {
  constructor(private deps: Deps) {}

  /** Deletes the card with its deliveries. Its photo stays with the website's uploads. */
  async execute(userId: string, websiteId: string, kind: CardKind): Promise<void> {
    await loadOwnedCard(this.deps, userId, websiteId, kind);
    await this.deps.cards.delete(websiteId, kind);
  }
}

export type CardSummary = {
  websiteId: string;
  websiteTitle: string;
  kind: CardKind;
  model: CardModel;
  /** Households the card is meant for, sent to, opened by; null for the engagement announcement. */
  counts: { households: number; sent: number; opened: number } | null;
  active: boolean;
  /** The engagement announcement's shareable link. */
  publicUrl: string | null;
  updatedAt: Date;
};

export class ListCards {
  constructor(private deps: Deps) {}

  /** Every card of the user's websites for the dashboard, in kind order. */
  async execute(userId: string): Promise<CardSummary[]> {
    const result: CardSummary[] = [];
    for (const website of await this.deps.websites.listByOwner(userId)) {
      const ctx = await loadGuestContext(this.deps, website);
      if (ctx.cards.length === 0) continue;
      const households = await this.deps.guests.listHouseholds(website.id);
      for (const card of [...ctx.cards].sort((a, b) => CARD_KINDS.indexOf(a.kind) - CARD_KINDS.indexOf(b.kind))) {
        const deliveries = isHouseholdCardKind(card.kind) ? await this.deps.cards.listDeliveries(card.id) : [];
        result.push({
          websiteId: website.id,
          websiteTitle: website.title,
          kind: card.kind,
          model: modelFor(this.deps, ctx, card, null, pagePhoto(card)),
          counts: isHouseholdCardKind(card.kind) ? cardCounts(households.map((h) => deliveries.find((d) => d.householdId === h.id) ?? null)) : null,
          active: ctx.cardActive(card.kind),
          publicUrl: card.kind === "engagement" ? `${this.deps.appUrl}/${website.slug}/${CARD_SLUGS.engagement}` : null,
          updatedAt: card.updatedAt,
        });
      }
    }
    return result;
  }
}

export type ExportFormat = "png" | PaperFormat;

export class ExportCard {
  constructor(private deps: Deps) {}

  /** PNG for messengers, PDF in A6 or A5 for printing at home. Needs the card's tier. */
  async execute(userId: string, websiteId: string, kind: CardKind, format: ExportFormat): Promise<{ filename: string; contentType: string; bytes: Uint8Array }> {
    const { ctx, card } = await loadOwnedCard(this.deps, userId, websiteId, kind);
    if (!ctx.cardActive(kind)) throw new LockedError();
    const photo = await photoBytes(this.deps, card);
    const model = modelFor(this.deps, ctx, card, null, photo ? "photo" : null);
    const name = CARD_SLUGS[kind];
    if (format === "png") return { filename: `${name}.png`, contentType: "image/png", bytes: await this.deps.cardRenderer.png(model, photo, PNG_EXPORT_WIDTH) };
    return { filename: `${name}-${format}.pdf`, contentType: "application/pdf", bytes: await this.deps.cardRenderer.pdf(model, photo, format) };
  }
}

// ---- the guests' side: the household page ----

export type PageCard = { kind: CardKind; model: CardModel; envelope: boolean; icsUrl: string | null; websiteUrl: string | null };
type PageWebsite = Pick<Website, "title" | "slug" | "weddingDate" | "timezone">;

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
  | { state: "empty" | "inactive"; website: PageWebsite; design: ResolvedDesign };

const pageWebsite = ({ title, slug, weddingDate, timezone }: Website): PageWebsite => ({ title, slug, weddingDate, timezone });

function pageCard(deps: Deps, ctx: GuestContext, card: Card, household: Pick<Household, "name" | "personalLine"> | null): PageCard {
  const { slug, weddingDate } = ctx.view.website;
  return {
    kind: card.kind,
    model: modelFor(deps, ctx, card, household, pagePhoto(card)),
    envelope: card.envelope,
    icsUrl: card.kind === "saveTheDate" && weddingDate ? `/${slug}/hochzeit.ics` : null,
    websiteUrl: card.kind === "saveTheDate" || (card.kind === "engagement" && card.content.showWebsiteLink) ? `/${slug}` : null,
  };
}

export class GetHouseholdPage {
  constructor(private deps: Deps) {}

  /**
   * The household's page behind its personal link: the cards sent to it, newest first, and the response form
   * with the invitation. Without cards it is the v3 response page. Null for unknown links; an inactive link
   * reveals nothing about the household.
   */
  async execute(token: string): Promise<HouseholdPageView | null> {
    const found = await loadByToken(this.deps, token);
    if (!found) return null;
    const { ctx, household, website } = found;
    const content = await householdContent(this.deps, ctx, household);
    const base = { website: pageWebsite(website), design: ctx.view.design };
    if (content.kinds.length === 0 && !content.form) return { ...base, state: ctx.sending ? "empty" : "inactive" };
    const cards = content.kinds.map((kind) => pageCard(this.deps, ctx, ctx.cards.find((c) => c.kind === kind)!, household));
    return {
      ...base,
      state: "page",
      greeting: household.name,
      envelope: cards[0]?.envelope ?? false,
      cards,
      form: content.form ? formFor(ctx, household, isReplyOpen(ctx.settings.replyBy, website.timezone, ctx.now) ? "open" : "closed") : null,
    };
  }
}

export class GetCardPreview {
  constructor(private deps: Deps) {}

  /** A card as guests see it, for the first household or a sample one. Free; it records nothing. */
  async execute(userId: string, websiteId: string, kind: CardKind): Promise<Extract<HouseholdPageView, { state: "page" }>> {
    const { website, ctx, card } = await loadOwnedCard(this.deps, userId, websiteId, kind);
    const [first] = await this.deps.guests.listHouseholds(websiteId);
    const household: Household = first ?? {
      id: "preview",
      name: this.deps.cardTexts.sampleHousehold,
      invitedEventIds: null,
      message: "",
      pollAnswers: {},
      respondedAt: null,
      createdAt: ctx.now,
      email: null,
      personalLine: "",
      unsubscribedAt: null,
      requests: [],
      people: [],
    };
    const isEngagement = kind === "engagement";
    return {
      state: "page",
      website: pageWebsite(website),
      design: ctx.view.design,
      greeting: isEngagement ? null : household.name,
      envelope: card.envelope,
      cards: [pageCard(this.deps, ctx, card, isEngagement ? null : household)],
      form: kind === "invitation" && household.people.length > 0 ? formFor(ctx, household, "preview") : null,
    };
  }
}

export class MarkCardsOpened {
  constructor(private deps: Deps) {}

  /**
   * Called by the household's page once a card is actually shown (the envelope opened). Only the first time
   * counts, only for cards the page shows. Returns the kinds recorded now.
   */
  async execute(token: string, kinds: readonly string[]): Promise<HouseholdCardKind[]> {
    const found = await loadByToken(this.deps, token);
    if (!found) return [];
    const { ctx, household } = found;
    const content = await householdContent(this.deps, ctx, household);
    const recorded: HouseholdCardKind[] = [];
    for (const kind of content.kinds.filter((k) => kinds.includes(k))) {
      const card = ctx.cards.find((c) => c.kind === kind)!;
      if (await this.deps.cards.markOpened(card.id, household.id, ctx.now)) recorded.push(kind);
    }
    return recorded;
  }
}

export type EngagementPage =
  | { state: "active"; website: PageWebsite; design: ResolvedDesign; card: PageCard }
  | { state: "inactive"; website: PageWebsite; design: ResolvedDesign };

export class GetEngagementPage {
  constructor(private deps: Deps) {}

  /** The engagement announcement's one shareable link. Null if the website has none. */
  async execute(slug: string): Promise<EngagementPage | null> {
    const website = await this.deps.websites.findBySlug(slug);
    if (!website) return null;
    const ctx = await loadGuestContext(this.deps, website);
    const card = ctx.cards.find((c) => c.kind === "engagement");
    if (!card) return null;
    const base = { website: pageWebsite(website), design: ctx.view.design };
    if (!ctx.cardActive("engagement")) return { ...base, state: "inactive" };
    return { ...base, state: "active", card: pageCard(this.deps, ctx, card, null) };
  }
}

// ---- the couple: sending ----

async function loadHouseholdCard(deps: Deps, userId: string, websiteId: string, kind: CardKind, householdId: string) {
  if (!isHouseholdCardKind(kind)) throw new NotFoundError();
  const loaded = await loadOwnedCard(deps, userId, websiteId, kind);
  const household = await deps.guests.findHousehold(websiteId, householdId);
  if (!household) throw new NotFoundError();
  const delivery = (await deps.cards.listDeliveries(loaded.card.id)).find((d) => d.householdId === householdId) ?? null;
  return { ...loaded, household, delivery };
}

export class ShareCard {
  constructor(private deps: Deps) {}

  /** The couple shares a card by WhatsApp or copied link: records it and returns the link and the text. */
  async execute(userId: string, websiteId: string, kind: CardKind, householdId: string, via: SharedVia): Promise<{ link: string; message: string }> {
    const { ctx, card, household, delivery } = await loadHouseholdCard(this.deps, userId, websiteId, kind, householdId);
    if (!ctx.cardActive(kind)) throw new LockedError();
    if (delivery?.excluded) throw new ValidationError({ _: "excluded" });
    await this.deps.cards.markShared(card.id, householdId, via, ctx.now);
    return { link: linkUrl(this.deps, householdId), message: personalize(cardMessage(this.deps, card), household.name) };
  }
}

export class SetCardExcluded {
  constructor(private deps: Deps) {}

  /** Leaves a household out of a card (or back in). Every household gets every card by default. */
  async execute(userId: string, websiteId: string, kind: CardKind, householdId: string, excluded: boolean): Promise<void> {
    const { card } = await loadHouseholdCard(this.deps, userId, websiteId, kind, householdId);
    await this.deps.cards.setExcluded(card.id, householdId, excluded);
  }
}

export type SendTarget = { householdId: string } | "all";

export class SendCardEmails {
  constructor(private deps: Deps) {}

  /**
   * Queues the card's email for one household (again, if asked) or for every household with an address that
   * has not had it yet. The background job sends them; the caller kicks it.
   */
  async execute(userId: string, websiteId: string, kind: CardKind, target: SendTarget): Promise<{ queued: number }> {
    if (!isHouseholdCardKind(kind)) throw new NotFoundError();
    const { ctx, card } = await loadOwnedCard(this.deps, userId, websiteId, kind);
    if (!ctx.cardActive(kind) || !ctx.can("emailSending")) throw new LockedError();
    const deliveries = await this.deps.cards.listDeliveries(card.id);
    const households = (await this.deps.guests.listHouseholds(websiteId)).map((h) => ({ ...h, delivery: deliveries.find((d) => d.householdId === h.id) ?? null }));
    let ids: string[];
    if (target === "all") ids = emailRecipients(households).map((h) => h.id);
    else {
      const household = households.find((h) => h.id === target.householdId);
      if (!household) throw new NotFoundError();
      if (!household.email) throw new ValidationError({ email: "no_email" });
      if (household.delivery?.excluded) throw new ValidationError({ _: "excluded" });
      ids = [household.id];
    }
    return { queued: ids.length ? await this.deps.cards.queueMail("card", card.id, ids, ctx.now) : 0 };
  }
}

export class SendReminders {
  constructor(private deps: Deps) {}

  /**
   * "Erinnerung senden" for one household or every open one: an email where there is an address (Einladungen
   * tier), otherwise a WhatsApp link for the couple to open (RSVP tier).
   */
  async execute(userId: string, websiteId: string, target: SendTarget): Promise<{ queued: number; whatsapp: { householdId: string; name: string; url: string }[] }> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const ctx = await loadGuestContext(this.deps, website);
    const byEmail = ctx.can("emailReminders");
    if (!ctx.sending && !byEmail) throw new LockedError();
    const invitation = ctx.cards.find((c) => c.kind === "invitation");
    const deliveries = invitation ? await this.deps.cards.listDeliveries(invitation.id) : [];
    const all = await this.deps.guests.listHouseholds(websiteId);
    const chosen = target === "all" ? all.filter((h) => householdStatus(h) === "open") : all.filter((h) => h.id === target.householdId);
    if (target !== "all" && chosen.length === 0) throw new NotFoundError();
    const households = chosen.filter((h) => !deliveries.find((d) => d.householdId === h.id)?.excluded);
    const emailIds = byEmail && invitation ? households.filter((h) => h.email).map((h) => h.id) : [];
    const queued = emailIds.length ? await this.deps.cards.queueMail("reminder", invitation!.id, emailIds, ctx.now) : 0;
    const whatsapp = ctx.sending
      ? households.filter((h) => !emailIds.includes(h.id)).map((h) => ({ householdId: h.id, name: h.name, url: whatsappUrl(reminderMessage(this.deps, invitation), h.name, linkUrl(this.deps, h.id)) }))
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

  async execute(options: { websiteId?: string } = {}): Promise<MailJobsResult> {
    this.contexts.clear();
    this.images.clear();
    const result: MailJobsResult = { sent: 0, failed: 0, reminders: 0 };
    const now = this.deps.clock.now();
    await this.deps.cards.failStaleClaims(new Date(now.getTime() - STALE_CLAIM_MS));

    let handled = 0;
    while (handled < MAX_MAILS_PER_RUN) {
      const batch = await this.deps.cards.listQueuedMail(this.deps.mailRate.batchSize, options.websiteId);
      if (batch.length === 0) break;
      let claimed = 0;
      for (const queued of batch) {
        if (!(await this.deps.cards.claimMail(queued.channel, queued.cardId, queued.householdId, this.deps.clock.now()))) continue;
        claimed++;
        handled++;
        const outcome = await this.sendQueued(queued);
        await this.deps.cards.finishMail(queued.channel, queued.cardId, queued.householdId, outcome === "sent" ? { sentAt: this.deps.clock.now() } : { error: outcome });
        if (outcome === "sent") result.sent++;
        else result.failed++;
        await this.pause();
      }
      if (claimed === 0) break;
    }

    for (const { websiteId, cardId } of await this.deps.cards.listInvitationsWithReminders()) {
      if (options.websiteId && websiteId !== options.websiteId) continue;
      const outcome = await this.automaticReminders(websiteId, cardId).catch((error) => {
        console.error(`[traureise] automatic reminders failed for ${websiteId}`, error);
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

  private context(websiteId: string): Promise<GuestContext | null> {
    let ctx = this.contexts.get(websiteId);
    if (!ctx) {
      ctx = this.deps.websites.findById(websiteId).then((w) => (w ? loadGuestContext(this.deps, w) : null));
      this.contexts.set(websiteId, ctx);
    }
    return ctx;
  }

  private async sendQueued(queued: QueuedMail): Promise<"sent" | string> {
    const ctx = await this.context(queued.websiteId);
    const card = ctx?.cards.find((c) => c.id === queued.cardId);
    const household = ctx && (await this.deps.guests.findHousehold(queued.websiteId, queued.householdId));
    if (!ctx || !card || !household) return "gone";
    if (!household.email) return "no_email";
    if (queued.channel === "card" ? !ctx.cardActive(card.kind) || !ctx.can("emailSending") : !ctx.can("emailReminders")) return "locked";
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
    const owner = await this.deps.users.findById(ctx.view.website.ownerId);
    const stop = this.deps.guestLinks.unsubscribeTokenFor(household.id);
    return {
      to: household.email!,
      fromName: `${ctx.view.website.title} über Traureise`,
      replyTo: owner?.email,
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
      couple: ctx.view.website.title,
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
      couple: ctx.view.website.title,
      household: household.name,
      message: personalize(reminderMessage(this.deps, card), household.name),
      ...this.links(household),
      replyBy: replyBy ? new Date(`${replyBy}T00:00:00Z`) : null,
    });
    await this.deps.mailer.send({ ...(await this.envelope(ctx, household)), ...mail });
  }

  private async automaticReminders(websiteId: string, cardId: string): Promise<{ sent: number; failed: number }> {
    const outcome = { sent: 0, failed: 0 };
    const ctx = await this.context(websiteId);
    const card = ctx?.cards.find((c) => c.id === cardId);
    if (!ctx || !card || !ctx.can("emailReminders") || !ctx.cardActive("invitation")) return outcome;
    const deliveries = await this.deps.cards.listDeliveries(cardId);
    for (const household of await this.deps.guests.listHouseholds(websiteId)) {
      const delivery = deliveries.find((d) => d.householdId === household.id);
      const sent = sentAt(delivery ?? null);
      if (!household.email || household.respondedAt || !delivery || delivery.excluded || !sent) continue;
      const offset = reminderDue({ replyBy: ctx.settings.replyBy, days: card.reminderDays, lastOffset: delivery.reminderOffset, sentAt: sent, timeZone: ctx.view.website.timezone, now: ctx.now });
      if (offset === null || !(await this.deps.cards.claimAutomaticReminder(cardId, household.id, offset, this.deps.clock.now()))) continue;
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
  const website = found && (await deps.websites.findById(found.websiteId));
  return found && website ? { household: found.household, website } : null;
}

export class GetUnsubscribe {
  constructor(private deps: Deps) {}

  /** What the unsubscribe page says: whose emails stop, and whether that already happened. */
  async execute(token: string): Promise<{ couple: string; household: string; done: boolean } | null> {
    const found = await householdOfUnsubscribe(this.deps, token);
    if (!found) return null;
    return { couple: found.website.title, household: found.household.name, done: !found.household.email && !!found.household.unsubscribedAt };
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
