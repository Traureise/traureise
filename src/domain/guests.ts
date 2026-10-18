import { z } from "zod";
import { isoDate, optional, requiredText, text } from "./fields";
import { parseWith, type FieldErrors, type Parsed } from "./result";

/** Guest lists: households with people, the couple's RSVP settings, and the rules for answers. */

export const NOTIFY_MODES = ["off", "each", "daily"] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];
export const POLL_SCOPES = ["person", "household"] as const;
export type PollScope = (typeof POLL_SCOPES)[number];
export const REQUEST_STATUSES = ["pending", "added", "declined"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type HouseholdStatus = "open" | "answered" | "declined";

export type ChoiceOption = { id: string; label: string };
export type PollAnswer = { optionIds: string[]; other: string | null };
export type PollAnswers = Record<string, PollAnswer>;
export type Poll = { id: string; question: string; multiple: boolean; allowOther: boolean; per: PollScope; options: ChoiceOption[] };
export type MealChoice = { eventId: string | null; options: ChoiceOption[] };
export type RsvpSettings = {
  replyBy: string | null;
  /** Schedule items guests can choose from; null means all of them. */
  eventIds: string[] | null;
  meal: MealChoice | null;
  notify: NotifyMode;
  /** The couple's WhatsApp text; null uses the default. `{name}` becomes the household's name. */
  whatsappMessage: string | null;
};
export const DEFAULT_RSVP_SETTINGS: RsvpSettings = { replyBy: null, eventIds: null, meal: null, notify: "off", whatsappMessage: null };

export type Guest = {
  id: string;
  name: string;
  isChild: boolean;
  attending: boolean | null;
  eventIds: string[];
  mealOptionId: string | null;
  allergies: string;
  pollAnswers: PollAnswers;
  /** Added by the couple from a household's request. */
  fromRequest: boolean;
};
export type GuestRequest = { id: string; name: string; status: RequestStatus; createdAt: Date; decidedAt: Date | null };
export type Household = {
  id: string;
  name: string;
  /** Events this household is invited to; null means all RSVP events. */
  invitedEventIds: string[] | null;
  message: string;
  pollAnswers: PollAnswers;
  /** When the household last answered; null while open. */
  respondedAt: Date | null;
  createdAt: Date;
  people: Guest[];
  requests: GuestRequest[];
};
/** A schedule item guests can answer for. */
export type RsvpEvent = { id: string; name: string; startDate: string; startTime: string };

export const NAME_MAX = 120;
export const ALLERGIES_MAX = 500;
export const MESSAGE_MAX = 2000;
export const OTHER_MAX = 200;
export const MAX_REQUESTS = 10;

// ---- events and meal ----

const byStart = (a: RsvpEvent, b: RsvpEvent) => `${a.startDate}T${a.startTime}`.localeCompare(`${b.startDate}T${b.startTime}`);

/** The schedule items guests can choose from, in date order. */
export function rsvpEvents(settings: Pick<RsvpSettings, "eventIds">, schedule: readonly RsvpEvent[]): RsvpEvent[] {
  const chosen = settings.eventIds ? schedule.filter((e) => settings.eventIds!.includes(e.id)) : [...schedule];
  return chosen.sort(byStart);
}

/** The RSVP events a household is invited to. */
export function householdEvents(household: Pick<Household, "invitedEventIds">, events: readonly RsvpEvent[]): RsvpEvent[] {
  return household.invitedEventIds ? events.filter((e) => household.invitedEventIds!.includes(e.id)) : [...events];
}

/** Whether to ask for the meal, given the events (of a household, or one person) in question. */
export function mealApplies(meal: MealChoice | null, eventIds: readonly string[]): boolean {
  if (!meal || meal.options.length === 0) return false;
  return meal.eventId === null || eventIds.includes(meal.eventId);
}

export function householdStatus(household: Pick<Household, "respondedAt" | "people">): HouseholdStatus {
  if (!household.respondedAt) return "open";
  return household.people.some((p) => p.attending) ? "answered" : "declined";
}

const localDay = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const localHour = (now: Date, timeZone: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));

/** Answers can change until the end of the reply-by day in the website's timezone. */
export function isReplyOpen(replyBy: string | null, timeZone: string, now: Date): boolean {
  return !replyBy || localDay(now, timeZone) <= replyBy;
}

export const DAILY_SUMMARY_HOUR = 8;

/** The daily summary goes out once a day, from 8:00 in the website's timezone. */
export function dailySummaryDue(lastSummaryAt: Date | null, timeZone: string, now: Date): boolean {
  if (localHour(now, timeZone) < DAILY_SUMMARY_HOUR) return false;
  return !lastSummaryAt || localDay(lastSummaryAt, timeZone) < localDay(now, timeZone);
}

// ---- the couple's input ----

const ids = z.array(z.string().min(1).max(64)).max(200);
const option = z.object({ id: optional(z.string().max(64)).default(null), label: text(120) });
/** Options without a label are dropped; options without an id get one from the use case. */
const options = z.array(option).max(30).transform((list) => list.filter((o) => o.label !== ""));
export type ChoiceOptionInput = z.infer<typeof option>;

const settingsSchema = z.object({
  replyBy: optional(isoDate).default(null),
  eventIds: ids.nullable().default(null),
  meal: z
    .object({ eventId: optional(z.string().max(64)).default(null), options })
    .nullable()
    .default(null)
    .transform((m) => (m && m.options.length > 0 ? m : null)),
  notify: z.enum(NOTIFY_MODES, "invalid_option").default("off"),
  whatsappMessage: optional(z.string().trim().max(500, "too_long")).default(null),
});
export type RsvpSettingsInput = z.infer<typeof settingsSchema>;

export function parseRsvpSettings(input: unknown): Parsed<RsvpSettingsInput> {
  return parseWith(settingsSchema, input);
}

const pollSchema = z.object({
  question: requiredText(200),
  multiple: z.boolean().default(false),
  allowOther: z.boolean().default(false),
  per: z.enum(POLL_SCOPES, "invalid_option").default("person"),
  options: options.refine((list) => list.length >= 2, "too_few"),
});
export type PollInput = z.infer<typeof pollSchema>;

export function parsePoll(input: unknown): Parsed<PollInput> {
  return parseWith(pollSchema, input);
}

const householdSchema = z.object({
  name: requiredText(NAME_MAX),
  invitedEventIds: ids.nullable().default(null),
  people: z
    .array(z.object({ id: optional(z.string().max(64)).default(null), name: text(NAME_MAX), isChild: z.boolean().default(false) }))
    .max(30)
    .transform((list) => list.filter((p) => p.name !== ""))
    .refine((list) => list.length >= 1, "too_few"),
});
export type HouseholdInput = z.infer<typeof householdSchema>;

export function parseHouseholdInput(input: unknown): Parsed<HouseholdInput> {
  return parseWith(householdSchema, input);
}

// ---- the guests' answer ----

export type PersonResponse = Omit<Guest, "id" | "name" | "isChild" | "fromRequest" | "attending"> & { guestId: string; attending: boolean };
export type HouseholdResponse = { people: PersonResponse[]; pollAnswers: PollAnswers; message: string; requests: string[] };
export type ResponseContext = { household: Household; events: readonly RsvpEvent[]; meal: MealChoice | null; polls: readonly Poll[] };

const rawAnswer = z.object({ optionIds: z.array(z.string()).max(30).default([]), other: optional(z.string().trim()).default(null) });
const rawPerson = z.object({
  attending: z.boolean().nullable().default(null),
  eventIds: z.array(z.string()).max(50).default([]),
  mealOptionId: optional(z.string()).default(null),
  allergies: z.string().default(""),
  polls: z.record(z.string(), rawAnswer).default({}),
});
const rawResponse = z.object({
  people: z.record(z.string(), rawPerson).default({}),
  polls: z.record(z.string(), rawAnswer).default({}),
  message: z.string().default(""),
  requests: z.array(z.string()).max(50).default([]),
});

function pollAnswers(raw: Record<string, z.infer<typeof rawAnswer>>, polls: readonly Poll[], key: string, errors: FieldErrors): PollAnswers {
  const result: PollAnswers = {};
  for (const [pollId, answer] of Object.entries(raw)) {
    const poll = polls.find((p) => p.id === pollId);
    if (!poll) {
      errors[key] ??= "invalid";
      continue;
    }
    const optionIds = [...new Set(answer.optionIds)];
    const other = answer.other || null;
    const valid =
      optionIds.every((id) => poll.options.some((o) => o.id === id)) &&
      (poll.multiple || optionIds.length + (other ? 1 : 0) <= 1) &&
      (!other || poll.allowOther) &&
      (!other || other.length <= OTHER_MAX);
    if (!valid) errors[`${key}.${pollId}`] = "invalid_option";
    else if (optionIds.length > 0 || other) result[pollId] = { optionIds, other };
  }
  return result;
}

/**
 * Validates a household's answer against that household only: people, events, meal options and polls
 * from anywhere else are rejected. What does not apply (answers of someone who is not coming) is dropped.
 */
export function parseResponse(input: unknown, ctx: ResponseContext): Parsed<HouseholdResponse> {
  const raw = rawResponse.safeParse(input);
  if (!raw.success) return { ok: false, fieldErrors: { _: "invalid" } };
  const errors: FieldErrors = {};
  const { household, meal } = ctx;
  const invited = householdEvents(household, ctx.events).map((e) => e.id);
  const personPolls = ctx.polls.filter((p) => p.per === "person");
  const householdPolls = ctx.polls.filter((p) => p.per === "household");

  if (Object.keys(raw.data.people).some((id) => !household.people.some((p) => p.id === id))) errors.people = "invalid";

  const people: PersonResponse[] = [];
  for (const person of household.people) {
    const key = `people.${person.id}`;
    const answer = raw.data.people[person.id];
    if (!answer || answer.attending === null) {
      errors[`${key}.attending`] = "required";
      continue;
    }
    if (!answer.attending) {
      people.push({ guestId: person.id, attending: false, eventIds: [], mealOptionId: null, allergies: "", pollAnswers: {} });
      continue;
    }
    const eventIds = invited.filter((id) => answer.eventIds.includes(id));
    if (answer.eventIds.some((id) => !invited.includes(id))) errors[`${key}.eventIds`] = "invalid_option";
    else if (invited.length > 0 && eventIds.length === 0) errors[`${key}.eventIds`] = "required";

    let mealOptionId: string | null = null;
    if (mealApplies(meal, eventIds)) {
      if (!answer.mealOptionId) errors[`${key}.mealOptionId`] = "required";
      else if (!meal!.options.some((o) => o.id === answer.mealOptionId)) errors[`${key}.mealOptionId`] = "invalid_option";
      else mealOptionId = answer.mealOptionId;
    }

    const allergies = answer.allergies.trim();
    if (allergies.length > ALLERGIES_MAX) errors[`${key}.allergies`] = "too_long";
    people.push({ guestId: person.id, attending: true, eventIds, mealOptionId, allergies, pollAnswers: pollAnswers(answer.polls, personPolls, `${key}.polls`, errors) });
  }

  const householdAnswers = pollAnswers(raw.data.polls, householdPolls, "polls", errors);
  const message = raw.data.message.trim();
  if (message.length > MESSAGE_MAX) errors.message = "too_long";
  const requests = raw.data.requests.map((r) => r.trim()).filter(Boolean);
  if (requests.length > MAX_REQUESTS) errors.requests = "too_many";
  if (requests.some((r) => r.length > NAME_MAX)) errors.requests = "too_long";

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { people, pollAnswers: householdAnswers, message, requests } };
}

// ---- the couple's overview ----

export type GuestOverview = {
  people: { coming: number; notComing: number; open: number };
  households: { answered: number; total: number };
  events: { id: string; name: string; count: number }[];
  meals: (ChoiceOption & { count: number })[];
  polls: { id: string; question: string; options: (ChoiceOption & { count: number })[]; other: string[] }[];
  allergies: { name: string; household: string; allergies: string }[];
  requests: { id: string; name: string; householdId: string; household: string }[];
};

export function guestOverview(input: { households: readonly Household[]; events: readonly RsvpEvent[]; meal: MealChoice | null; polls: readonly Poll[] }): GuestOverview {
  const { households, events, meal, polls } = input;
  const people = households.flatMap((h) => h.people.map((p) => ({ ...p, household: h })));
  const coming = people.filter((p) => p.attending === true);
  const countAnswers = (answers: PollAnswer[], poll: Poll) => ({
    id: poll.id,
    question: poll.question,
    options: poll.options.map((o) => ({ ...o, count: answers.filter((a) => a.optionIds.includes(o.id)).length })),
    other: answers.map((a) => a.other).filter((o): o is string => !!o),
  });
  return {
    people: {
      coming: coming.length,
      notComing: people.filter((p) => p.attending === false).length,
      open: people.filter((p) => p.attending === null).length,
    },
    households: { answered: households.filter((h) => h.respondedAt).length, total: households.length },
    events: rsvpEvents({ eventIds: null }, events).map((e) => ({ id: e.id, name: e.name, count: coming.filter((p) => p.eventIds.includes(e.id)).length })),
    meals: (meal?.options ?? []).map((o) => ({ ...o, count: coming.filter((p) => p.mealOptionId === o.id).length })),
    polls: polls.map((poll) =>
      countAnswers(
        poll.per === "person"
          ? coming.flatMap((p) => (p.pollAnswers[poll.id] ? [p.pollAnswers[poll.id]!] : []))
          : households.flatMap((h) => (h.respondedAt && h.pollAnswers[poll.id] ? [h.pollAnswers[poll.id]!] : [])),
        poll,
      ),
    ),
    allergies: coming.filter((p) => p.allergies).map((p) => ({ name: p.name, household: p.household.name, allergies: p.allergies })),
    requests: households.flatMap((h) => h.requests.filter((r) => r.status === "pending").map((r) => ({ id: r.id, name: r.name, householdId: h.id, household: h.name }))),
  };
}

// ---- CSV export ----

/** Quotes a CSV cell and defuses spreadsheet formulas (a cell starting with =, +, -, @, tab or CR). */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export type CsvLabels = {
  household: string;
  name: string;
  child: string;
  status: string;
  meal: string;
  allergies: string;
  message: string;
  yes: string;
  no: string;
  statuses: { coming: string; notComing: string; open: string };
};

/** Every person with their answers, `;`-separated with a BOM so spreadsheet apps open it as UTF-8. */
export function guestsCsv(input: { households: readonly Household[]; events: readonly RsvpEvent[]; meal: MealChoice | null; polls: readonly Poll[]; labels: CsvLabels }): string {
  const { households, meal, polls, labels } = input;
  const events = rsvpEvents({ eventIds: null }, input.events);
  const header = [labels.household, labels.name, labels.child, labels.status, ...events.map((e) => e.name), ...(meal ? [labels.meal] : []), labels.allergies, ...polls.map((p) => p.question), labels.message];
  const answerText = (poll: Poll, answer: PollAnswer | undefined) =>
    answer ? [...poll.options.filter((o) => answer.optionIds.includes(o.id)).map((o) => o.label), ...(answer.other ? [answer.other] : [])].join(", ") : "";
  const rows = households.flatMap((h) =>
    h.people.map((p) => {
      const answered = p.attending !== null;
      const status = p.attending === null ? labels.statuses.open : p.attending ? labels.statuses.coming : labels.statuses.notComing;
      return [
        h.name,
        p.name,
        p.isChild ? labels.yes : labels.no,
        status,
        ...events.map((e) => (answered ? (p.eventIds.includes(e.id) ? labels.yes : labels.no) : "")),
        ...(meal ? [meal.options.find((o) => o.id === p.mealOptionId)?.label ?? ""] : []),
        p.allergies,
        ...polls.map((poll) => answerText(poll, poll.per === "person" ? p.pollAnswers[poll.id] : h.pollAnswers[poll.id])),
        h.message,
      ];
    }),
  );
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

// ---- sharing ----

/** A wa.me link the couple opens themselves; Traureise sends nothing to WhatsApp. */
export function whatsappUrl(message: string, householdName: string, link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message.replaceAll("{name}", householdName)}\n${link}`)}`;
}
