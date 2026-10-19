import { activeTier, type Tier } from "@/domain/billing";
import { cardCounts, CARD_KINDS, followWeddingDetails, isHouseholdCardKind, type CardModel, type HouseholdCardKind } from "@/domain/cards";
import { guestOverview } from "@/domain/guests";
import { SECTION_KINDS } from "@/domain/sections";
import { slugify } from "@/domain/slug";
import { DEFAULT_TIMEZONE } from "@/domain/website";
import {
  daysUntil,
  householdCardDone,
  needsDate,
  parseNewWedding,
  parseWeddingDetails,
  timelineStates,
  VERSION_FEATURES,
  VERSION_ITEMS,
  type StepState,
  type VersionItem,
} from "@/domain/weddings";
import { cardPreview, engagementUrl, newCardVersion, siteUrl } from "./cards";
import type { Deps } from "./deps";
import { ValidationError } from "./errors";
import { deliveriesByKind, loadGuestContext } from "./guest-context";
import { deleteImage, loadOwnedWedding } from "./owned";
import type { Section, Wedding } from "./ports";
import { assertSlugAvailable, uniqueSlug } from "./slugs";

export const emptySections = (): Section[] => SECTION_KINDS.map((kind) => ({ kind, title: null, visible: true, body: "" }));

export class CreateWedding {
  constructor(private deps: Deps) {}

  /**
   * The Hochzeit form: names and, if planned, the date. Generates one first version of every card and the
   * website, filled in from the wedding. The website is a draft: nothing is public until the couple decides.
   */
  async execute(ownerId: string, input: unknown): Promise<Wedding> {
    const parsed = parseNewWedding(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const { title, weddingDate } = parsed.value;
    const { weddings, websites, cards, themes, clock, cardTexts } = this.deps;
    const slug = await uniqueSlug(this.deps, slugify(title), { wedding: null });
    const wedding = await weddings.create({ ownerId, title, weddingDate, slug, timezone: DEFAULT_TIMEZONE });
    const website = await websites.create(
      {
        weddingId: wedding.id,
        label: cardTexts.firstVersionLabel,
        position: 0,
        slug: wedding.slug,
        published: false,
        hiddenEventIds: [],
        welcomeMessage: "",
        hashtag: "",
        showCountdown: false,
        coverImageKey: null,
        themeId: themes.defaultThemeId(),
        paletteId: null,
        fontPairingId: null,
      },
      emptySections(),
    );
    for (const kind of CARD_KINDS) await cards.create(newCardVersion(this.deps, wedding, website, kind, null));
    return weddings.update(wedding.id, { lastOpenedAt: clock.now() });
  }
}

/** Most recently used first, then oldest first. */
const byRecentUse = (a: Wedding, b: Wedding) => (b.lastOpenedAt?.getTime() ?? 0) - (a.lastOpenedAt?.getTime() ?? 0) || a.createdAt.getTime() - b.createdAt.getTime();

export class ListWeddings {
  constructor(private deps: Deps) {}

  /** In the order they were created (the list of weddings). */
  async execute(ownerId: string): Promise<Wedding[]> {
    return (await this.deps.weddings.listByOwner(ownerId)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

export class GetRecentWedding {
  constructor(private deps: Deps) {}

  /** The wedding /dashboard opens: the one used last. Null for an account without weddings. */
  async execute(ownerId: string): Promise<Wedding | null> {
    return [...(await this.deps.weddings.listByOwner(ownerId))].sort(byRecentUse)[0] ?? null;
  }
}

export type StepStatus =
  | { kind: "engagement"; shared: boolean; active: boolean }
  | { kind: "household"; counts: { households: number; sent: number; opened: number }; needsDate: boolean; active: boolean }
  | { kind: "website"; online: number; versions: number };

export type HomeStep = {
  item: VersionItem;
  state: StepState;
  /** First first; `href` targets are built by the app (card or website editor). */
  versions: { id: string; label: string; online?: boolean; publicUrl: string | null }[];
  /** A small preview of the first version: the card, or the website's cover and theme. */
  preview: { card: CardModel } | { website: { coverImageKey: string | null; themeId: string } };
  status: StepStatus;
  /** "+ Version" is unlocked (canUse). */
  canAddVersion: boolean;
  /** Engagement versions: their messages for WhatsApp, by id. */
  messages: Record<string, string>;
};

export type WeddingHome = {
  wedding: Wedding;
  steps: HomeStep[];
  /** Days until the wedding; null without a date. */
  countdown: number | null;
  guests: { households: number; coming: number; open: number };
  /** Only with billing on. */
  tier: Tier | null;
  others: { id: string; title: string }[];
};

export class GetWeddingHome {
  constructor(private deps: Deps) {}

  /** The home screen of a wedding: the timeline of its items, the countdown and the guests. Remembers the visit. */
  async execute(userId: string, weddingId: string): Promise<WeddingHome> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const ctx = await loadGuestContext(this.deps, wedding);
    const [households, records, opens, all] = await Promise.all([
      this.deps.guests.listHouseholds(weddingId),
      this.deps.cards.listDeliveries(weddingId),
      this.deps.cards.listOpens(weddingId),
      this.deps.weddings.listByOwner(userId),
    ]);
    await this.deps.weddings.update(weddingId, { lastOpenedAt: ctx.now });
    const byHousehold = households.map((h) => deliveriesByKind(ctx, records, opens, h.id));
    const counts = (kind: HouseholdCardKind) => cardCounts(byHousehold.map((d) => d[kind]));

    const steps = VERSION_ITEMS.map((item): Omit<HomeStep, "state"> & { done: boolean } => {
      const canAddVersion = ctx.can(VERSION_FEATURES[item]);
      if (item === "website") {
        const online = ctx.websites.filter((w) => ctx.online(w)).length;
        const first = ctx.firstWebsite();
        return {
          item,
          done: online > 0,
          versions: ctx.websites.map((w) => ({ id: w.id, label: w.label, online: ctx.online(w), publicUrl: siteUrl(this.deps, ctx, w) })),
          preview: { website: { coverImageKey: first?.coverImageKey ?? null, themeId: first?.themeId ?? this.deps.themes.defaultThemeId() } },
          status: { kind: "website", online, versions: ctx.websites.length },
          canAddVersion,
          messages: {},
        };
      }
      const versions = ctx.versionsOf(item);
      const first = versions[0]!;
      const base = {
        item,
        versions: versions.map((c) => ({ id: c.id, label: c.label, publicUrl: item === "engagement" ? engagementUrl(this.deps, wedding, c, versions) : null })),
        preview: { card: cardPreview(this.deps, ctx, first) },
        canAddVersion,
        messages: item === "engagement" ? Object.fromEntries(versions.map((c) => [c.id, c.message ?? this.deps.cardTexts.defaults.engagement.message])) : {},
      };
      if (!isHouseholdCardKind(item)) {
        const shared = versions.some((c) => c.sharedAt);
        return { ...base, done: shared, status: { kind: "engagement", shared, active: ctx.cardActive(item) } };
      }
      const c = counts(item);
      return { ...base, done: householdCardDone(c), status: { kind: "household", counts: c, needsDate: needsDate(item) && !wedding.weddingDate, active: ctx.cardActive(item) } };
    });
    const states = timelineStates(Object.fromEntries(steps.map((s) => [s.item, s.done])) as Record<VersionItem, boolean>);
    const overview = guestOverview({ households, events: ctx.events, meal: ctx.meal, polls: ctx.polls });
    return {
      wedding,
      steps: steps.map(({ item, versions, preview, status, canAddVersion, messages }) => ({ item, versions, preview, status, canAddVersion, messages, state: states[item] })),
      countdown: wedding.weddingDate ? daysUntil(wedding.weddingDate, wedding.timezone, ctx.now) : null,
      guests: { households: households.length, coming: overview.people.coming, open: overview.people.open },
      tier: this.deps.billing.enabled ? activeTier(ctx.features.entitlements, ctx.now) : null,
      others: all.filter((w) => w.id !== weddingId).sort(byRecentUse).map(({ id, title }) => ({ id, title })),
    };
  }
}

export class UpdateWeddingDetails {
  constructor(private deps: Deps) {}

  /** Names, date, place and time zone, which every card and website version share; cards follow unless their text was changed. */
  async execute(userId: string, weddingId: string, input: unknown): Promise<Wedding> {
    const before = await loadOwnedWedding(this.deps, userId, weddingId);
    const parsed = parseWeddingDetails(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const after = await this.deps.weddings.update(weddingId, parsed.value);
    for (const card of await this.deps.cards.listByWedding(weddingId)) {
      const content = followWeddingDetails(card.kind, card.content, before, after);
      if (!content) continue;
      const { themeId, paletteId, fontPairingId, layoutId, envelope, photoKey, message, reminderDays, reminderMessage } = card;
      await this.deps.cards.update(card.id, { themeId, paletteId, fontPairingId, layoutId, envelope, photoKey, content, message, reminderDays, reminderMessage });
    }
    return after;
  }
}

export class UpdateWeddingSlug {
  constructor(private deps: Deps) {}

  /** The address of the links that are not a website. Changing it never changes a website version's. */
  async execute(userId: string, weddingId: string, slug: string): Promise<Wedding> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const normalized = slug.trim();
    if (normalized === wedding.slug) return wedding;
    await assertSlugAvailable(this.deps, normalized, { wedding: weddingId });
    return this.deps.weddings.update(weddingId, { slug: normalized });
  }
}

export class DeleteWedding {
  constructor(private deps: Deps) {}

  /** Deletes everything in the wedding: versions, cards, guest list, packages and photos. */
  async execute(userId: string, weddingId: string): Promise<void> {
    await loadOwnedWedding(this.deps, userId, weddingId);
    const keys = await this.deps.uploads.listKeysByWedding(weddingId);
    await this.deps.weddings.delete(weddingId);
    for (const key of keys) await deleteImage(this.deps, key);
  }
}
