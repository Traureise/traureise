import { canUse, type FeatureContext } from "@/domain/billing";
import { CARD_FEATURES, householdPageContent, HOUSEHOLD_CARD_KINDS, type CardKind, type HouseholdCardKind } from "@/domain/cards";
import { householdEvents, mealApplies, rsvpEvents, type Household, type MealChoice, type Poll, type RsvpEvent } from "@/domain/guests";
import { guestDataDeletionDate, guestLinksActive } from "@/domain/retention";
import type { ResolvedDesign } from "@/domain/theme";
import type { Deps } from "./deps";
import type { DeliveryRecord, Website } from "./ports";
import { itemsOf, loadView } from "./views";

/** Everything about a website's guests and cards that the rules need. */
export async function loadGuestContext(deps: Deps, website: Website) {
  const view = await loadView(deps, website);
  const [settings, polls, entitlements, cards] = await Promise.all([
    deps.guests.getSettings(website.id),
    deps.guests.listPolls(website.id),
    deps.billingRepo.listByWebsite(website.id),
    deps.cards.listByWebsite(website.id),
  ]);
  const schedule: RsvpEvent[] = itemsOf(view, "schedule").map((i) => ({ id: i.id, name: i.data.name, startDate: i.data.startDate, startTime: i.data.startTime }));
  const features: FeatureContext = { billingEnabled: deps.billing.enabled, entitlements };
  const now = deps.clock.now();
  const events = rsvpEvents(settings, schedule);
  const deleteAt = guestDataDeletionDate({ weddingDate: website.weddingDate, entitlements });
  const beforeDeletion = !deleteAt || now < deleteAt;
  return {
    view,
    settings,
    polls,
    schedule,
    events,
    // The meal's event must be on offer; otherwise nobody could choose a meal.
    meal: settings.meal && (!settings.meal.eventId || events.some((e) => e.id === settings.meal!.eventId)) ? settings.meal : null,
    now,
    features,
    cards,
    sending: guestLinksActive(features, website.weddingDate, now),
    deleteAt,
    /** A card's links, export and sending are unlocked; household cards also stop when the guest data goes. */
    cardActive: (kind: CardKind) => canUse(CARD_FEATURES[kind], features, now) && (kind === "engagement" || beforeDeletion),
    can: (feature: Parameters<typeof canUse>[0]) => canUse(feature, features, now),
  };
}
export type GuestContext = Awaited<ReturnType<typeof loadGuestContext>>;

export const guestsUrl = (deps: Deps, websiteId: string) => `${deps.appUrl}/websites/${websiteId}/gaeste`;
export const linkUrl = (deps: Deps, householdId: string) => `${deps.appUrl}/antwort/${deps.guestLinks.tokenFor(householdId)}`;

/** A household's deliveries per card kind (null where nothing happened yet). */
export function deliveriesByKind(ctx: GuestContext, deliveries: readonly DeliveryRecord[], householdId: string): Record<HouseholdCardKind, DeliveryRecord | null> {
  const byKind = {} as Record<HouseholdCardKind, DeliveryRecord | null>;
  for (const kind of HOUSEHOLD_CARD_KINDS) {
    const card = ctx.cards.find((c) => c.kind === kind);
    byKind[kind] = (card && deliveries.find((d) => d.cardId === card.id && d.householdId === householdId)) ?? null;
  }
  return byKind;
}

/** What a household's page shows: its cards newest first, and whether the response form is on it. */
export async function householdContent(deps: Deps, ctx: GuestContext, household: Household) {
  const deliveries = deliveriesByKind(ctx, await deps.cards.listDeliveriesOfHousehold(household.id), household.id);
  const cards = HOUSEHOLD_CARD_KINDS.filter((kind) => ctx.cards.some((c) => c.kind === kind)).map((kind) => ({ kind, active: ctx.cardActive(kind), delivery: deliveries[kind] }));
  return { ...householdPageContent({ cards, rsvpActive: ctx.sending }), deliveries };
}

// ---- the response form ----

type FormWebsite = Pick<Website, "title" | "weddingDate" | "timezone">;
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

export function formFor(ctx: GuestContext, household: Household, state: GuestForm["state"]): GuestForm {
  const events = householdEvents(household, ctx.events);
  const { title, weddingDate, timezone } = ctx.view.website;
  return {
    state,
    website: { title, weddingDate, timezone },
    design: ctx.view.design,
    household,
    events,
    meal: mealApplies(ctx.meal, events.map((e) => e.id)) ? ctx.meal : null,
    polls: ctx.polls.map(({ id, question, multiple, allowOther, per, options }) => ({ id, question, multiple, allowOther, per, options })),
    replyBy: ctx.settings.replyBy,
  };
}

export async function loadByToken(deps: Deps, token: string) {
  const found = token ? await deps.guests.findByTokenHash(deps.guestLinks.hash(token)) : null;
  const website = found && (await deps.websites.findById(found.websiteId));
  if (!found || !website) return null;
  return { website, household: found.household, ctx: await loadGuestContext(deps, website) };
}
