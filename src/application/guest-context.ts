import { canUse, type FeatureContext } from "@/domain/billing";
import { CARD_FEATURES, householdPageContent, HOUSEHOLD_CARD_KINDS, type CardKind, type Delivery, type HouseholdCardKind } from "@/domain/cards";
import { householdEvents, mealApplies, rsvpEvents, type Household, type MealChoice, type Poll, type RsvpEvent } from "@/domain/guests";
import { guestDataDeletionDate, guestLinksActive } from "@/domain/retention";
import type { ResolvedDesign } from "@/domain/theme";
import { assignedVersion, firstVersion, websiteOnline, type AssignableItem } from "@/domain/weddings";
import type { Deps } from "./deps";
import type { Card, DeliveryRecord, OpenRecord, Website, Wedding } from "./ports";
import { designOf } from "./views";

/** Everything about a wedding's guests, cards and website versions that the rules need. */
export async function loadGuestContext(deps: Deps, wedding: Wedding) {
  const [settings, polls, entitlements, cards, websites, eventItems, assignments] = await Promise.all([
    deps.guests.getSettings(wedding.id),
    deps.guests.listPolls(wedding.id),
    deps.billingRepo.listByWedding(wedding.id),
    deps.cards.listByWedding(wedding.id),
    deps.websites.listByWedding(wedding.id),
    deps.weddings.listEvents(wedding.id),
    deps.guests.listAssignments(wedding.id),
  ]);
  const schedule: RsvpEvent[] = eventItems.map((i) => ({ id: i.id, name: i.data.name, startDate: i.data.startDate, startTime: i.data.startTime }));
  const features: FeatureContext = { billingEnabled: deps.billing.enabled, entitlements };
  const now = deps.clock.now();
  const events = rsvpEvents(settings, schedule);
  const deleteAt = guestDataDeletionDate({ weddingDate: wedding.weddingDate, entitlements });
  const beforeDeletion = !deleteAt || now < deleteAt;
  const can = (feature: Parameters<typeof canUse>[0]) => canUse(feature, features, now);
  const versionsOf = (kind: CardKind): Card[] => cards.filter((c) => c.kind === kind).sort((a, b) => a.position - b.position);
  return {
    wedding,
    settings,
    polls,
    schedule,
    eventItems,
    events,
    // The meal's event must be on offer; otherwise nobody could choose a meal.
    meal: settings.meal && (!settings.meal.eventId || events.some((e) => e.id === settings.meal!.eventId)) ? settings.meal : null,
    now,
    features,
    cards,
    websites,
    assignments,
    sending: guestLinksActive(features, wedding.weddingDate, now),
    deleteAt,
    /** A card's links, export and sending are unlocked; they stop when the guest data goes. */
    cardActive: (kind: CardKind) => canUse(CARD_FEATURES[kind], features, now) && beforeDeletion,
    can,
    versionsOf,
    /** The version of a card kind this household gets: its assigned one, else the first. */
    cardFor: (householdId: string, kind: HouseholdCardKind): Card | null => assignedVersion(versionsOf(kind), assignments, householdId, kind),
    /** The website version this household's cards link to and whose design its page takes. */
    websiteFor: (householdId: string): Website | null => assignedVersion(websites, assignments, householdId, "website"),
    /** Published, and the first version or a paid package for the others. */
    online: (website: Website) => websiteOnline(website, websites, can("websiteVersions")),
    firstWebsite: (): Website | null => firstVersion(websites),
    assigned: (householdId: string, item: AssignableItem) =>
      (item === "website" ? assignedVersion(websites, assignments, householdId, item) : assignedVersion(versionsOf(item), assignments, householdId, item))?.id ?? null,
  };
}
export type GuestContext = Awaited<ReturnType<typeof loadGuestContext>>;

export const guestsUrl = (deps: Deps, weddingId: string) => `${deps.appUrl}/hochzeiten/${weddingId}/gaeste`;
export const linkUrl = (deps: Deps, householdId: string) => `${deps.appUrl}/antwort/${deps.guestLinks.tokenFor(householdId)}`;

/** The design of a household's pages: its website version's, published or not (the page is private to it). */
export function householdDesign(deps: Deps, ctx: GuestContext, householdId: string | null): ResolvedDesign {
  const website = (householdId && ctx.websiteFor(householdId)) || ctx.firstWebsite();
  return designOf(deps, website ?? { themeId: deps.themes.defaultThemeId(), paletteId: null, fontPairingId: null });
}

/**
 * A household's deliveries per card kind (null where nothing happened yet). "Sent" counts per kind, whichever
 * version went out; "opened" is the household's assigned version's.
 */
export function deliveriesByKind(ctx: GuestContext, deliveries: readonly DeliveryRecord[], opens: readonly OpenRecord[], householdId: string): Record<HouseholdCardKind, Delivery | null> {
  const byKind = {} as Record<HouseholdCardKind, Delivery | null>;
  for (const kind of HOUSEHOLD_CARD_KINDS) {
    const record = deliveries.find((d) => d.kind === kind && d.householdId === householdId);
    const card = ctx.cardFor(householdId, kind);
    const openedAt = (card && opens.find((o) => o.cardId === card.id && o.householdId === householdId)?.openedAt) ?? null;
    byKind[kind] = record || openedAt ? { ...emptyDelivery(), ...record, openedAt } : null;
  }
  return byKind;
}

const emptyDelivery = (): Delivery => ({
  excluded: false,
  sharedAt: null,
  sharedVia: null,
  emailQueuedAt: null,
  emailedAt: null,
  emailError: null,
  openedAt: null,
  reminderOffset: null,
  reminderQueuedAt: null,
  remindedAt: null,
  reminderError: null,
});

/** What a household's page shows: its cards newest first, and whether the response form is on it. */
export async function householdContent(deps: Deps, ctx: GuestContext, household: Household) {
  const [records, opens] = await Promise.all([deps.cards.listDeliveriesOfHousehold(household.id), deps.cards.listOpensOfHousehold(household.id)]);
  const deliveries = deliveriesByKind(ctx, records, opens, household.id);
  const cards = HOUSEHOLD_CARD_KINDS.filter((kind) => ctx.cardFor(household.id, kind)).map((kind) => ({ kind, active: ctx.cardActive(kind), delivery: deliveries[kind] }));
  return { ...householdPageContent({ cards, rsvpActive: ctx.sending }), deliveries };
}

// ---- the response form ----

type FormWebsite = Pick<Wedding, "title" | "weddingDate" | "timezone">;
export type GuestForm = {
  state: "open" | "closed" | "preview";
  website: FormWebsite;
  design: ResolvedDesign;
  household: Household;
  /** The household's events, in date order. */
  events: RsvpEvent[];
  /** Set when the household is asked for a meal. */
  meal: MealChoice | null;
  polls: Poll[];
  replyBy: string | null;
};

export function formFor(deps: Deps, ctx: GuestContext, household: Household, state: GuestForm["state"]): GuestForm {
  const events = householdEvents(household, ctx.events);
  const { title, weddingDate, timezone } = ctx.wedding;
  return {
    state,
    website: { title, weddingDate, timezone },
    design: householdDesign(deps, ctx, household.id),
    household,
    events,
    meal: mealApplies(ctx.meal, events.map((e) => e.id)) ? ctx.meal : null,
    polls: ctx.polls.map(({ id, question, multiple, allowOther, per, options }) => ({ id, question, multiple, allowOther, per, options })),
    replyBy: ctx.settings.replyBy,
  };
}

export async function loadByToken(deps: Deps, token: string) {
  const found = token ? await deps.guests.findByTokenHash(deps.guestLinks.hash(token)) : null;
  const wedding = found && (await deps.weddings.findById(found.weddingId));
  if (!found || !wedding) return null;
  return { wedding, household: found.household, ctx: await loadGuestContext(deps, wedding) };
}
