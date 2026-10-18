import { HOUSEHOLD_CARD_KINDS, type HouseholdCardKind } from "@/domain/cards";
import {
  dailySummaryDue,
  guestOverview,
  guestsCsv,
  householdEvents,
  householdStatus,
  isReplyOpen,
  parseHouseholdInput,
  parsePoll,
  parseResponse,
  parseRsvpSettings,
  type ChoiceOption,
  type ChoiceOptionInput,
  type CsvLabels,
  type GuestOverview,
  type Household,
  type HouseholdStatus,
  type Poll,
  type RsvpEvent,
  type RsvpSettings,
} from "@/domain/guests";
import { guestDataDeletionDate, retentionWarningDue } from "@/domain/retention";
import { RunMailJobs } from "./cards";
import type { Deps } from "./deps";
import { NotFoundError, RateLimitedError, ValidationError } from "./errors";
import { deliveriesByKind, formFor, guestsUrl, householdContent, linkUrl, loadByToken, loadGuestContext, type GuestForm } from "./guest-context";
import { loadOwnedWebsite } from "./owned";
import type { DeliveryRecord, PollRecord, Website } from "./ports";

export type { GuestForm } from "./guest-context";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_LINK = 20;
const MAX_PER_IP = 60;

export type GuestListEntry = Household & {
  status: HouseholdStatus;
  events: RsvpEvent[];
  link: string | null;
  /** What happened with each card for this household (v4). */
  deliveries: Record<HouseholdCardKind, DeliveryRecord | null>;
};

export type GuestPage = {
  website: Website;
  settings: RsvpSettings;
  polls: PollRecord[];
  /** All schedule items, for the settings. */
  schedule: RsvpEvent[];
  /** The ones guests can choose from. */
  events: RsvpEvent[];
  households: GuestListEntry[];
  overview: GuestOverview;
  /** Personal links accept answers and can be shared (RSVP tier, or no billing). */
  sending: boolean;
  billingEnabled: boolean;
  deleteAt: Date | null;
  deletionSoon: boolean;
  /** The website's household cards and whether each is unlocked (links, sending). */
  cards: { kind: HouseholdCardKind; active: boolean; message: string }[];
  /** Email sending and email reminders (Einladungen tier, or no billing). */
  emailSending: boolean;
  emailReminders: boolean;
  /** WhatsApp text of reminders ("{name}" is the household). */
  reminderMessage: string;
};

export class GetGuestPage {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string): Promise<GuestPage> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const ctx = await loadGuestContext(this.deps, website);
    const households = await this.deps.guests.listHouseholds(websiteId);
    const deliveries = (await Promise.all(ctx.cards.map((c) => this.deps.cards.listDeliveries(c.id)))).flat();
    return {
      website,
      settings: ctx.settings,
      polls: ctx.polls,
      schedule: ctx.schedule,
      events: ctx.events,
      households: households.map((h) => ({
        ...h,
        status: householdStatus(h),
        events: householdEvents(h, ctx.events),
        link: ctx.sending ? linkUrl(this.deps, h.id) : null,
        deliveries: deliveriesByKind(ctx, deliveries, h.id),
      })),
      overview: guestOverview({ households, events: ctx.events, meal: ctx.meal, polls: ctx.polls }),
      sending: ctx.sending,
      billingEnabled: this.deps.billing.enabled,
      deleteAt: ctx.deleteAt,
      deletionSoon: households.length > 0 && retentionWarningDue(ctx.deleteAt, ctx.now),
      cards: HOUSEHOLD_CARD_KINDS.flatMap((kind) => {
        const card = ctx.cards.find((c) => c.kind === kind);
        return card ? [{ kind, active: ctx.cardActive(kind), message: card.message ?? this.deps.cardTexts.defaults[kind].message }] : [];
      }),
      emailSending: ctx.can("emailSending"),
      emailReminders: ctx.can("emailReminders"),
      reminderMessage: ctx.cards.find((c) => c.kind === "invitation")?.reminderMessage ?? this.deps.cardTexts.reminderMessage,
    };
  }
}

export class SaveHousehold {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, householdId: string | null, input: unknown): Promise<Household> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const parsed = parseHouseholdInput(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const { schedule } = await loadGuestContext(this.deps, website);
    const data = {
      ...parsed.value,
      invitedEventIds: parsed.value.invitedEventIds?.filter((id) => schedule.some((e) => e.id === id)) ?? null,
    };
    const { guests, guestLinks } = this.deps;
    if (!householdId) return guests.createHousehold(websiteId, data, (id) => guestLinks.hash(guestLinks.tokenFor(id)));

    const existing = await guests.findHousehold(websiteId, householdId);
    if (!existing) throw new NotFoundError();
    if (data.people.some((p) => p.id && !existing.people.some((x) => x.id === p.id))) throw new ValidationError({ people: "invalid_person" });
    await guests.updateHousehold(websiteId, householdId, data);
    return (await guests.findHousehold(websiteId, householdId))!;
  }
}

export class DeleteHousehold {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, householdId: string): Promise<void> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    if (!(await this.deps.guests.findHousehold(websiteId, householdId))) throw new NotFoundError();
    await this.deps.guests.deleteHousehold(websiteId, householdId);
  }
}

/** Options keep their ids so answers survive edits; new ones get a short random id. */
function withIds(deps: Deps, options: ChoiceOptionInput[]): ChoiceOption[] {
  return options.map((o) => ({ id: o.id ?? deps.tokens.generate().slice(0, 12), label: o.label }));
}

export class SaveRsvpSettings {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, input: unknown): Promise<void> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const parsed = parseRsvpSettings(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const { schedule } = await loadGuestContext(this.deps, website);
    const known = (id: string) => schedule.some((e) => e.id === id);
    const { eventIds, meal } = parsed.value;
    if (eventIds?.some((id) => !known(id))) throw new ValidationError({ eventIds: "invalid_option" });
    if (meal?.eventId && !known(meal.eventId)) throw new ValidationError({ "meal.eventId": "invalid_option" });
    await this.deps.guests.saveSettings(websiteId, {
      ...parsed.value,
      meal: meal ? { eventId: meal.eventId, options: withIds(this.deps, meal.options) } : null,
    });
  }
}

export class SavePoll {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, pollId: string | null, input: unknown): Promise<Poll> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    const parsed = parsePoll(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const poll = { ...parsed.value, options: withIds(this.deps, parsed.value.options) };
    if (!pollId) return this.deps.guests.createPoll(websiteId, poll);
    if (!(await this.deps.guests.updatePoll(websiteId, pollId, poll))) throw new NotFoundError();
    return { ...poll, id: pollId };
  }
}

export class DeletePoll {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, pollId: string): Promise<void> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    await this.deps.guests.deletePoll(websiteId, pollId);
  }
}

export class DecideGuestRequest {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, requestId: string, decision: "added" | "declined"): Promise<void> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    if (!(await this.deps.guests.decideRequest(websiteId, requestId, decision, this.deps.clock.now()))) throw new NotFoundError();
  }
}

export class ExportGuestsCsv {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, labels: CsvLabels): Promise<{ filename: string; csv: string }> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const ctx = await loadGuestContext(this.deps, website);
    const households = await this.deps.guests.listHouseholds(websiteId);
    return {
      filename: `gaeste-${ctx.now.toISOString().slice(0, 10)}.csv`,
      csv: guestsCsv({ households, events: ctx.events, meal: ctx.meal, polls: ctx.polls, labels }),
    };
  }
}

// ---- the guests' side ----

export class GetGuestFormPreview {
  constructor(private deps: Deps) {}

  /** The form as guests see it, for the first household or a sample one. Free, and it saves nothing. */
  async execute(userId: string, websiteId: string, sample: { household: string; people: string[] }): Promise<GuestForm> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const ctx = await loadGuestContext(this.deps, website);
    const [first] = await this.deps.guests.listHouseholds(websiteId);
    const household: Household = first ?? {
      id: "preview",
      name: sample.household,
      invitedEventIds: null,
      message: "",
      pollAnswers: {},
      respondedAt: null,
      createdAt: ctx.now,
      email: null,
      personalLine: "",
      unsubscribedAt: null,
      requests: [],
      people: sample.people.map((name, i) => ({ id: `preview-${i}`, name, isChild: false, attending: null, eventIds: [], mealOptionId: null, allergies: "", pollAnswers: {}, fromRequest: false })),
    };
    return formFor(ctx, household, "preview");
  }
}

export class SubmitGuestResponse {
  constructor(private deps: Deps) {}

  async execute(input: { token: string; input: unknown; ip: string }): Promise<void> {
    const { rateLimiter, guests, guestLinks, mailer, guestMail, users } = this.deps;
    const now = this.deps.clock.now();
    const linkKey = `rsvp:link:${guestLinks.hash(input.token)}`;
    const ipAllowed = await rateLimiter.hit(`rsvp:ip:${input.ip}`, MAX_PER_IP, RATE_WINDOW_MS, now);
    const linkAllowed = await rateLimiter.hit(linkKey, MAX_PER_LINK, RATE_WINDOW_MS, now);
    if (!ipAllowed || !linkAllowed) throw new RateLimitedError();

    const found = await loadByToken(this.deps, input.token);
    if (!found) throw new NotFoundError();
    const { ctx, household, website } = found;
    if (!ctx.sending || !(await householdContent(this.deps, ctx, household)).form) throw new ValidationError({ _: "inactive" });
    if (!isReplyOpen(ctx.settings.replyBy, website.timezone, ctx.now)) throw new ValidationError({ _: "closed" });

    const parsed = parseResponse(input.input, { household, events: ctx.events, meal: ctx.meal, polls: ctx.polls });
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    await guests.saveResponse(household.id, parsed.value, now);

    if (ctx.settings.notify !== "each") return;
    try {
      const owner = await users.findById(website.ownerId);
      if (!owner) return;
      const name = (guestId: string) => household.people.find((p) => p.id === guestId)!.name;
      const mail = guestMail.answer({
        websiteTitle: website.title,
        household: household.name,
        coming: parsed.value.people.filter((p) => p.attending).map((p) => name(p.guestId)),
        notComing: parsed.value.people.filter((p) => !p.attending).map((p) => name(p.guestId)),
        message: parsed.value.message,
        requests: parsed.value.requests,
        guestsUrl: guestsUrl(this.deps, website.id),
      });
      await mailer.send({ to: owner.email, ...mail });
    } catch (error) {
      // The answer is saved; the couple still sees it on the Gäste page.
      console.error("[traureise] answer notification failed", error);
    }
  }
}

// ---- background jobs ----

export type GuestJobsResult = { deleted: string[]; warned: string[]; summaries: string[]; emails: number; reminders: number };

/**
 * Retention and daily summaries. Idempotent and safe on several instances at once: deleting twice
 * deletes nothing, and every email is claimed in the database before it is sent.
 */
export class RunGuestJobs {
  constructor(private deps: Deps) {}

  async execute(options: { websiteId?: string } = {}): Promise<GuestJobsResult> {
    const result: GuestJobsResult = { deleted: [], warned: [], summaries: [], emails: 0, reminders: 0 };
    const inScope = (ids: string[]) => (options.websiteId ? ids.filter((id) => id === options.websiteId) : ids);

    for (const websiteId of inScope(await this.deps.guests.listWebsiteIdsWithGuests())) {
      const outcome = await this.retention(websiteId).catch((error) => {
        console.error(`[traureise] guest retention failed for ${websiteId}`, error);
        return null;
      });
      if (outcome) result[outcome].push(websiteId);
    }
    for (const websiteId of inScope(await this.deps.guests.listWebsiteIdsWithDailySummary())) {
      const sent = await this.summary(websiteId).catch((error) => {
        console.error(`[traureise] daily summary failed for ${websiteId}`, error);
        return false;
      });
      if (sent) result.summaries.push(websiteId);
    }
    // Emails the couple queued that are still waiting (the instance restarted, say), and automatic reminders.
    const mail = await new RunMailJobs(this.deps).execute(options);
    result.emails = mail.sent;
    result.reminders = mail.reminders;
    return result;
  }

  private async retention(websiteId: string): Promise<"deleted" | "warned" | null> {
    const { websites, billingRepo, guests, clock } = this.deps;
    const website = await websites.findById(websiteId);
    if (!website) return null;
    const deleteAt = guestDataDeletionDate({ weddingDate: website.weddingDate, entitlements: await billingRepo.listByWebsite(websiteId) });
    const now = clock.now();
    if (deleteAt && now >= deleteAt) {
      await guests.deleteGuestData(websiteId);
      return "deleted";
    }
    if (!retentionWarningDue(deleteAt, now) || !(await guests.claimRetentionWarning(websiteId, deleteAt!))) return null;
    const owner = await this.deps.users.findById(website.ownerId);
    if (!owner) return null;
    const mail = this.deps.guestMail.retentionWarning({ websiteTitle: website.title, deleteOn: deleteAt!, guestsUrl: guestsUrl(this.deps, websiteId) });
    await this.deps.mailer.send({ to: owner.email, ...mail });
    return "warned";
  }

  private async summary(websiteId: string): Promise<boolean> {
    const { websites, guests, users, mailer, guestMail } = this.deps;
    const website = await websites.findById(websiteId);
    if (!website) return false;
    const ctx = await loadGuestContext(this.deps, website);
    if (!ctx.sending || ctx.settings.notify !== "daily") return false;
    const previous = await guests.lastSummaryAt(websiteId);
    if (!dailySummaryDue(previous, website.timezone, ctx.now)) return false;
    if (!(await guests.claimDailySummary(websiteId, previous, ctx.now))) return false;

    const households = await guests.listHouseholds(websiteId);
    const changed = households.filter((h) => h.respondedAt && (!previous || h.respondedAt > previous));
    if (changed.length === 0) return false;
    const owner = await users.findById(website.ownerId);
    if (!owner) return false;
    const overview = guestOverview({ households, events: ctx.events, meal: ctx.meal, polls: ctx.polls });
    const mail = guestMail.dailySummary({
      websiteTitle: website.title,
      households: changed.map((h) => ({ name: h.name, coming: h.people.filter((p) => p.attending).length, notComing: h.people.filter((p) => p.attending === false).length })),
      totals: overview.people,
      guestsUrl: guestsUrl(this.deps, websiteId),
    });
    await mailer.send({ to: owner.email, ...mail });
    return true;
  }
}
