import { HOUSEHOLD_CARD_KINDS, type Delivery, type HouseholdCardKind } from "@/domain/cards";
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
import { ASSIGNABLE_ITEMS, type AssignableItem } from "@/domain/weddings";
import { RunMailJobs } from "./cards";
import type { Deps } from "./deps";
import { NotFoundError, RateLimitedError, ValidationError } from "./errors";
import { deliveriesByKind, formFor, guestsUrl, householdContent, linkUrl, loadByToken, loadGuestContext, type GuestForm } from "./guest-context";
import { loadOwnedWedding } from "./owned";
import type { PollRecord, Wedding } from "./ports";

export type { GuestForm } from "./guest-context";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_LINK = 20;
const MAX_PER_IP = 60;

export type GuestListEntry = Household & {
  status: HouseholdStatus;
  events: RsvpEvent[];
  link: string | null;
  /** What happened with each card for this household (v4); "opened" is its assigned version's. */
  deliveries: Record<HouseholdCardKind, Delivery | null>;
  /** The version of each item it gets. */
  versions: Record<AssignableItem, string | null>;
  /** WhatsApp text of each card, from its version ("{name}" not yet replaced). */
  messages: Record<HouseholdCardKind, string>;
  /** WhatsApp text of reminders, from its invitation version. */
  reminderMessage: string;
};

export type GuestPage = {
  wedding: Wedding;
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
  /** The wedding's household cards and whether each is unlocked (links, sending) or waits for a date. */
  cards: { kind: HouseholdCardKind; active: boolean; waitsForDate: boolean }[];
  /** Items with more than one version: the guest list offers a choice per household. */
  versionChoices: { item: AssignableItem; versions: { id: string; label: string }[] }[];
  /** Email sending and email reminders (Einladungen tier, or no billing). */
  emailSending: boolean;
  emailReminders: boolean;
  /** Answers are still possible, so reminders make sense. */
  replyOpen: boolean;
};

export class GetGuestPage {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string): Promise<GuestPage> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const ctx = await loadGuestContext(this.deps, wedding);
    const [households, records, opens] = await Promise.all([this.deps.guests.listHouseholds(weddingId), this.deps.cards.listDeliveries(weddingId), this.deps.cards.listOpens(weddingId)]);
    const { defaults } = this.deps.cardTexts;
    return {
      wedding,
      settings: ctx.settings,
      polls: ctx.polls,
      schedule: ctx.schedule,
      events: ctx.events,
      households: households.map((h) => ({
        ...h,
        status: householdStatus(h),
        events: householdEvents(h, ctx.events),
        link: ctx.sending ? linkUrl(this.deps, h.id) : null,
        deliveries: deliveriesByKind(ctx, records, opens, h.id),
        versions: Object.fromEntries(ASSIGNABLE_ITEMS.map((item) => [item, ctx.assigned(h.id, item)])) as Record<AssignableItem, string | null>,
        messages: Object.fromEntries(HOUSEHOLD_CARD_KINDS.map((kind) => [kind, ctx.cardFor(h.id, kind)?.message ?? defaults[kind].message])) as Record<HouseholdCardKind, string>,
        reminderMessage: ctx.cardFor(h.id, "invitation")?.reminderMessage ?? this.deps.cardTexts.reminderMessage,
      })),
      overview: guestOverview({ households, events: ctx.events, meal: ctx.meal, polls: ctx.polls }),
      sending: ctx.sending,
      billingEnabled: this.deps.billing.enabled,
      deleteAt: ctx.deleteAt,
      deletionSoon: households.length > 0 && retentionWarningDue(ctx.deleteAt, ctx.now),
      cards: HOUSEHOLD_CARD_KINDS.filter((kind) => ctx.versionsOf(kind).length > 0).map((kind) => ({
        kind,
        active: ctx.cardActive(kind),
        waitsForDate: (kind === "saveTheDate" || kind === "invitation") && !wedding.weddingDate,
      })),
      versionChoices: ASSIGNABLE_ITEMS.map((item) => ({ item, versions: (item === "website" ? ctx.websites : ctx.versionsOf(item)).map(({ id, label }) => ({ id, label })) })).filter((c) => c.versions.length > 1),
      emailSending: ctx.can("emailSending"),
      emailReminders: ctx.can("emailReminders"),
      replyOpen: isReplyOpen(ctx.settings.replyBy, wedding.timezone, ctx.now),
    };
  }
}

export class SaveHousehold {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, householdId: string | null, input: unknown): Promise<Household> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const parsed = parseHouseholdInput(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const { schedule } = await loadGuestContext(this.deps, wedding);
    const data = {
      ...parsed.value,
      invitedEventIds: parsed.value.invitedEventIds?.filter((id) => schedule.some((e) => e.id === id)) ?? null,
    };
    const { guests, guestLinks } = this.deps;
    if (!householdId) return guests.createHousehold(weddingId, data, (id) => guestLinks.hash(guestLinks.tokenFor(id)));

    const existing = await guests.findHousehold(weddingId, householdId);
    if (!existing) throw new NotFoundError();
    if (data.people.some((p) => p.id && !existing.people.some((x) => x.id === p.id))) throw new ValidationError({ people: "invalid_person" });
    await guests.updateHousehold(weddingId, householdId, data);
    return (await guests.findHousehold(weddingId, householdId))!;
  }
}

export class DeleteHousehold {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, householdId: string): Promise<void> {
    await loadOwnedWedding(this.deps, userId, weddingId);
    if (!(await this.deps.guests.findHousehold(weddingId, householdId))) throw new NotFoundError();
    await this.deps.guests.deleteHousehold(weddingId, householdId);
  }
}

/** Options keep their ids so answers survive edits; new ones get a short random id. */
function withIds(deps: Deps, options: ChoiceOptionInput[]): ChoiceOption[] {
  return options.map((o) => ({ id: o.id ?? deps.tokens.generate().slice(0, 12), label: o.label }));
}

export class SaveRsvpSettings {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, input: unknown): Promise<void> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const parsed = parseRsvpSettings(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const { schedule } = await loadGuestContext(this.deps, wedding);
    const known = (id: string) => schedule.some((e) => e.id === id);
    const { eventIds, meal } = parsed.value;
    if (eventIds?.some((id) => !known(id))) throw new ValidationError({ eventIds: "invalid_option" });
    if (meal?.eventId && !known(meal.eventId)) throw new ValidationError({ "meal.eventId": "invalid_option" });
    await this.deps.guests.saveSettings(weddingId, {
      ...parsed.value,
      meal: meal ? { eventId: meal.eventId, options: withIds(this.deps, meal.options) } : null,
    });
  }
}

export class SavePoll {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, pollId: string | null, input: unknown): Promise<Poll> {
    await loadOwnedWedding(this.deps, userId, weddingId);
    const parsed = parsePoll(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const poll = { ...parsed.value, options: withIds(this.deps, parsed.value.options) };
    if (!pollId) return this.deps.guests.createPoll(weddingId, poll);
    if (!(await this.deps.guests.updatePoll(weddingId, pollId, poll))) throw new NotFoundError();
    return { ...poll, id: pollId };
  }
}

export class DeletePoll {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, pollId: string): Promise<void> {
    await loadOwnedWedding(this.deps, userId, weddingId);
    await this.deps.guests.deletePoll(weddingId, pollId);
  }
}

export class DecideGuestRequest {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, requestId: string, decision: "added" | "declined"): Promise<void> {
    await loadOwnedWedding(this.deps, userId, weddingId);
    if (!(await this.deps.guests.decideRequest(weddingId, requestId, decision, this.deps.clock.now()))) throw new NotFoundError();
  }
}

export class ExportGuestsCsv {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, labels: CsvLabels): Promise<{ filename: string; csv: string }> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const ctx = await loadGuestContext(this.deps, wedding);
    const households = await this.deps.guests.listHouseholds(weddingId);
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
  async execute(userId: string, weddingId: string, sample: { household: string; people: string[] }): Promise<GuestForm> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const ctx = await loadGuestContext(this.deps, wedding);
    const [first] = await this.deps.guests.listHouseholds(weddingId);
    const household: Household = first ?? {
      id: "preview",
      name: sample.household,
      invitedEventIds: null,
      message: "",
      pollAnswers: {},
      respondedAt: null,
      answeredBy: null,
      createdAt: ctx.now,
      personalLine: "",
      unsubscribedAt: null,
      requests: [],
      people: sample.people.map((name, i) => ({ id: `preview-${i}`, name, isChild: false, attending: null, eventIds: [], mealOptionId: null, allergies: "", pollAnswers: {}, fromRequest: false, email: null })),
    };
    return formFor(this.deps, ctx, household, "preview");
  }
}

export class GetCoupleAnswerForm {
  constructor(private deps: Deps) {}

  /**
   * A household's form for the couple to fill in for it, for grandparents without a phone. Always open: before any
   * card went out, after the reply-by date and without a package, because nothing is sent.
   */
  async execute(userId: string, weddingId: string, householdId: string): Promise<GuestForm> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const household = await this.deps.guests.findHousehold(weddingId, householdId);
    if (!household) throw new NotFoundError();
    return formFor(this.deps, await loadGuestContext(this.deps, wedding), household, "couple");
  }
}

export class SaveCoupleAnswer {
  constructor(private deps: Deps) {}

  /** The couple's entry counts like the household's own answer, marked as theirs; nobody is notified. */
  async execute(userId: string, weddingId: string, householdId: string, input: unknown): Promise<void> {
    const wedding = await loadOwnedWedding(this.deps, userId, weddingId);
    const household = await this.deps.guests.findHousehold(weddingId, householdId);
    if (!household) throw new NotFoundError();
    const ctx = await loadGuestContext(this.deps, wedding);
    const parsed = parseResponse(input, { household, events: ctx.events, meal: ctx.meal, polls: ctx.polls });
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    // The couple adds people on the guest list (a request is the guests' way to ask), and the message to the couple
    // stays what the household wrote.
    await this.deps.guests.saveResponse(household.id, { ...parsed.value, message: household.message, requests: [] }, this.deps.clock.now(), "couple");
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
    const { ctx, household, wedding } = found;
    if (!ctx.sending || !(await householdContent(this.deps, ctx, household)).form) throw new ValidationError({ _: "inactive" });
    if (!isReplyOpen(ctx.settings.replyBy, wedding.timezone, ctx.now)) throw new ValidationError({ _: "closed" });

    const parsed = parseResponse(input.input, { household, events: ctx.events, meal: ctx.meal, polls: ctx.polls });
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    await guests.saveResponse(household.id, parsed.value, now, "guest");

    if (ctx.settings.notify !== "each") return;
    try {
      const owner = await users.findById(wedding.ownerId);
      if (!owner) return;
      const name = (guestId: string) => household.people.find((p) => p.id === guestId)!.name;
      const mail = guestMail.answer({
        websiteTitle: wedding.title,
        household: household.name,
        coming: parsed.value.people.filter((p) => p.attending).map((p) => name(p.guestId)),
        notComing: parsed.value.people.filter((p) => !p.attending).map((p) => name(p.guestId)),
        message: parsed.value.message,
        requests: parsed.value.requests,
        guestsUrl: guestsUrl(this.deps, wedding.id),
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

  async execute(options: { weddingId?: string } = {}): Promise<GuestJobsResult> {
    const result: GuestJobsResult = { deleted: [], warned: [], summaries: [], emails: 0, reminders: 0 };
    const inScope = (ids: string[]) => (options.weddingId ? ids.filter((id) => id === options.weddingId) : ids);

    for (const weddingId of inScope(await this.deps.guests.listWeddingIdsWithGuests())) {
      const outcome = await this.retention(weddingId).catch((error) => {
        console.error(`[traureise] guest retention failed for ${weddingId}`, error);
        return null;
      });
      if (outcome) result[outcome].push(weddingId);
    }
    for (const weddingId of inScope(await this.deps.guests.listWeddingIdsWithDailySummary())) {
      const sent = await this.summary(weddingId).catch((error) => {
        console.error(`[traureise] daily summary failed for ${weddingId}`, error);
        return false;
      });
      if (sent) result.summaries.push(weddingId);
    }
    // Emails the couple queued that are still waiting (the instance restarted, say), and automatic reminders.
    const mail = await new RunMailJobs(this.deps).execute(options);
    result.emails = mail.sent;
    result.reminders = mail.reminders;
    return result;
  }

  private async retention(weddingId: string): Promise<"deleted" | "warned" | null> {
    const { weddings, billingRepo, guests, clock } = this.deps;
    const wedding = await weddings.findById(weddingId);
    if (!wedding) return null;
    const deleteAt = guestDataDeletionDate({ weddingDate: wedding.weddingDate, entitlements: await billingRepo.listByWedding(weddingId) });
    const now = clock.now();
    if (deleteAt && now >= deleteAt) {
      await guests.deleteGuestData(weddingId);
      return "deleted";
    }
    if (!retentionWarningDue(deleteAt, now) || !(await guests.claimRetentionWarning(weddingId, deleteAt!))) return null;
    const owner = await this.deps.users.findById(wedding.ownerId);
    if (!owner) return null;
    const mail = this.deps.guestMail.retentionWarning({ websiteTitle: wedding.title, deleteOn: deleteAt!, guestsUrl: guestsUrl(this.deps, weddingId) });
    await this.deps.mailer.send({ to: owner.email, ...mail });
    return "warned";
  }

  private async summary(weddingId: string): Promise<boolean> {
    const { weddings, guests, users, mailer, guestMail } = this.deps;
    const wedding = await weddings.findById(weddingId);
    if (!wedding) return false;
    const ctx = await loadGuestContext(this.deps, wedding);
    if (!ctx.sending || ctx.settings.notify !== "daily") return false;
    const previous = await guests.lastSummaryAt(weddingId);
    if (!dailySummaryDue(previous, wedding.timezone, ctx.now)) return false;
    if (!(await guests.claimDailySummary(weddingId, previous, ctx.now))) return false;

    const households = await guests.listHouseholds(weddingId);
    const changed = households.filter((h) => h.respondedAt && (!previous || h.respondedAt > previous));
    if (changed.length === 0) return false;
    const owner = await users.findById(wedding.ownerId);
    if (!owner) return false;
    const overview = guestOverview({ households, events: ctx.events, meal: ctx.meal, polls: ctx.polls });
    const mail = guestMail.dailySummary({
      websiteTitle: wedding.title,
      households: changed.map((h) => ({ name: h.name, coming: h.people.filter((p) => p.attending).length, notComing: h.people.filter((p) => p.attending === false).length })),
      totals: overview.people,
      guestsUrl: guestsUrl(this.deps, weddingId),
    });
    await mailer.send({ to: owner.email, ...mail });
    return true;
  }
}
