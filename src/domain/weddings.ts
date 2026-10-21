import { z } from "zod";
import type { Feature } from "./billing";
import type { CardKind } from "./card-kinds";
import { dayNumber, localDay } from "./days";
import { bothOrNeither, bothOrNeitherError, isoDate, latitude, longitude, optional, requiredText } from "./fields";
import { parseWith, type Parsed } from "./result";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "./website";

/**
 * The wedding is the root of everything a couple makes: one first version of every item is generated with it,
 * in the order a couple needs them through the months (the home screen's timeline).
 */
export const VERSION_ITEMS = ["engagement", "saveTheDate", "website", "invitation", "thankYou"] as const;
export type VersionItem = (typeof VERSION_ITEMS)[number];

/** Items a household gets exactly one version of: every card and the website. */
export const ASSIGNABLE_ITEMS = ["engagement", "saveTheDate", "website", "invitation", "thankYou"] as const satisfies readonly VersionItem[];
export type AssignableItem = (typeof ASSIGNABLE_ITEMS)[number];

export function isVersionItem(value: string): value is VersionItem {
  return (VERSION_ITEMS as readonly string[]).includes(value);
}

export function isAssignableItem(value: string): value is AssignableItem {
  return (ASSIGNABLE_ITEMS as readonly string[]).includes(value);
}

/** Adding a version beyond the first needs this feature (canUse). */
export const VERSION_FEATURES = {
  engagement: "engagementVersions",
  saveTheDate: "saveTheDateVersions",
  website: "websiteVersions",
  invitation: "invitationVersions",
  thankYou: "thankYouVersions",
} as const satisfies Record<VersionItem, Feature>;

/** Save the Date and invitation are about the day: sending them waits until the wedding has a date. */
export function needsDate(kind: CardKind): boolean {
  return kind === "saveTheDate" || kind === "invitation";
}

// ---- input ----

export const TITLE_MAX = 120;
export const LOCATION_MAX = 200;
export const LABEL_MAX = 40;

/** "Already planned" means "has a date": only the date is stored. */
function withDate<T extends { hasDate: boolean; weddingDate: string | null }>(value: T, ctx: z.RefinementCtx) {
  if (value.hasDate && !value.weddingDate) ctx.addIssue({ code: "custom", path: ["weddingDate"], message: "required" });
}

const newWeddingSchema = z
  .object({ title: requiredText(TITLE_MAX), hasDate: z.boolean().default(false), weddingDate: optional(isoDate).default(null) })
  .superRefine(withDate)
  .transform(({ title, hasDate, weddingDate }) => ({ title, weddingDate: hasDate ? weddingDate : null }));
export type NewWeddingInput = z.infer<typeof newWeddingSchema>;

/** The Hochzeit form: the names, whether there is a date yet, and the date. Nothing else. */
export function parseNewWedding(input: unknown): Parsed<NewWeddingInput> {
  return parseWith(newWeddingSchema, input);
}

const detailsSchema = z
  .object({
    title: requiredText(TITLE_MAX),
    hasDate: z.boolean().default(false),
    weddingDate: optional(isoDate).default(null),
    location: optional(z.string().trim().max(LOCATION_MAX, "too_long")).default(null),
    latitude,
    longitude,
    timezone: z.string().refine(isValidTimeZone, "invalid_timezone").default(DEFAULT_TIMEZONE),
  })
  .superRefine(withDate)
  .refine(bothOrNeither, bothOrNeitherError)
  .transform(({ title, hasDate, weddingDate, location, latitude, longitude, timezone }) => ({
    title,
    weddingDate: hasDate ? weddingDate : null,
    location,
    latitude,
    longitude,
    timezone,
  }));
export type WeddingDetailsInput = z.infer<typeof detailsSchema>;

/** Names, date, place (with its spot on the map) and time zone: what every card and website version of the wedding shares. */
export function parseWeddingDetails(input: unknown): Parsed<WeddingDetailsInput> {
  return parseWith(detailsSchema, input);
}

const labelSchema = z.object({ label: requiredText(LABEL_MAX) });

/** A version's name, chosen by the couple ("Familie", "Freunde"). */
export function parseVersionLabel(input: unknown): Parsed<string> {
  const parsed = parseWith(labelSchema, { label: input });
  return parsed.ok ? { ok: true, value: parsed.value.label } : parsed;
}

// ---- versions ----

export type Version = { id: string; position: number };
export type Assignment = { householdId: string; item: AssignableItem; versionId: string };

/** The first version of an item: the one every household gets unless the couple chose another. */
export function firstVersion<V extends Version>(versions: readonly V[]): V | null {
  return versions.reduce<V | null>((first, v) => (!first || v.position < first.position ? v : first), null);
}

/** The version a household gets: the one assigned to it, or the first (also when the assigned one is gone). */
export function assignedVersion<V extends Version>(versions: readonly V[], assignments: readonly Assignment[], householdId: string, item: AssignableItem): V | null {
  const chosen = assignments.find((a) => a.householdId === householdId && a.item === item);
  return (chosen && versions.find((v) => v.id === chosen.versionId)) || firstVersion(versions);
}

/**
 * Whether a website version is public. Drafts never are. The first version is free; others need a paid package
 * and go offline without one (like links after a refund).
 */
export function websiteOnline(website: Version & { published: boolean }, versions: readonly Version[], extraVersionsAllowed: boolean): boolean {
  return website.published && (firstVersion(versions)?.id === website.id || extraVersionsAllowed);
}

// ---- the home screen ----

export type StepState = "done" | "now" | "later";

/** Finished steps are done; the first unfinished one is the next step; the other unfinished ones come later. */
export function timelineStates(done: Record<VersionItem, boolean>): Record<VersionItem, StepState> {
  const next = VERSION_ITEMS.find((item) => !done[item]);
  return Object.fromEntries(VERSION_ITEMS.map((item) => [item, done[item] ? "done" : item === next ? "now" : "later"])) as Record<VersionItem, StepState>;
}

/**
 * When couples usually do each step, in months relative to the wedding day (negative: before). The engagement
 * announcement has no window (as soon as you are engaged). The website has only an end: it should be online when the
 * invitation window opens. A Save the Date sent earlier still links it, once it is online.
 */
export const STEP_WINDOWS: Record<VersionItem, { from: number | null; to: number } | null> = {
  engagement: null,
  saveTheDate: { from: -12, to: -6 },
  website: { from: null, to: -4 },
  invitation: { from: -4, to: -3 },
  thankYou: { from: 0, to: 2 },
};

export type StepTiming =
  | { kind: "anytime" }
  /** Without a wedding date: only the rule ("6–12 Monate vorher"). */
  | { kind: "relative" }
  /** `before` the window opens, `open` while it is, `late` once it closed. Dates are ISO days; no start: open until the end. */
  | { kind: "dated"; start: string | null; end: string; phase: "before" | "open" | "late" };

/** The ISO day `months` months from `iso`, clamped to the end of a shorter month (31 March − 1 month = 28/29 February). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** When a step is due for a wedding on `weddingDate`, seen from `today` (both ISO days in the wedding's time zone). */
export function stepTiming(item: VersionItem, weddingDate: string | null, today: string): StepTiming {
  const window = STEP_WINDOWS[item];
  if (!window) return { kind: "anytime" };
  if (!weddingDate) return { kind: "relative" };
  // A window that starts on the wedding day (the thank-you card) opens the day after.
  const start = window.from === null ? null : window.from === 0 ? addDays(weddingDate, 1) : addMonths(weddingDate, window.from);
  const end = addMonths(weddingDate, window.to);
  return { kind: "dated", start, end, phase: start && today < start ? "before" : today > end ? "late" : "open" };
}

/** A household card is done once every household it is meant for got it. */
export function householdCardDone(counts: { households: number; sent: number }): boolean {
  return counts.households > 0 && counts.sent >= counts.households;
}

/** Days from today (in the wedding's time zone) to the wedding day; negative once it is past. */
export function daysUntil(weddingDate: string, timeZone: string, now: Date): number {
  return Math.round(dayNumber(weddingDate) - dayNumber(localDay(now, timeZone)));
}
