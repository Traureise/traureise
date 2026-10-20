/** Calendar dates (YYYY-MM-DD) are wall dates; format them in UTC so no timezone shifts the day. */
export function dateFromIso(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

/** Whole days from today (in the website's timezone) until the given date. */
export function daysUntil(isoDate: string, now: Date, timeZone: string): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return Math.round((dateFromIso(isoDate).getTime() - dateFromIso(today).getTime()) / 86_400_000);
}

export { uploadPath as uploadUrl } from "@/domain/images";

export function themeAssetUrl(themeId: string, file: string): string {
  return `/theme-assets/${themeId}/${file}`;
}

const zoneName = (timeZone: string, at: Date, style: "longGeneric" | "long" | "shortOffset") =>
  new Intl.DateTimeFormat("de", { timeZone, timeZoneName: style }).formatToParts(at).find((p) => p.type === "timeZoneName")!.value;

/** "UTC+1", "UTC-3", "UTC+5:30" (at that moment, so summer time counts). */
const utcOffset = (timeZone: string, at: Date) => zoneName(timeZone, at, "shortOffset").replace(/^GMT/, "UTC").replace(/^UTC$/, "UTC+0");

/** A time zone in German: "Mitteleuropäische Zeit – Berlin (UTC+1)". */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  if (timeZone === "UTC") return `${zoneName(timeZone, at, "long")} (UTC)`;
  const city = timeZone.split("/").at(-1)!.replace(/_/g, " ");
  return `${zoneName(timeZone, at, "longGeneric")} – ${city} (${utcOffset(timeZone, at)})`;
}

export type TimeZoneOption = { id: string; label: string };

/** Offset in minutes, for sorting. */
function offsetMinutes(timeZone: string, at: Date) {
  const match = /^UTC([+-])(\d+)(?::(\d+))?$/.exec(utcOffset(timeZone, at));
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
}

/** Time zones for a select, west to east, with German labels; the values stay IANA ids. */
export function timeZoneOptions(timeZones: string[] = Intl.supportedValuesOf("timeZone"), at: Date = new Date()): TimeZoneOption[] {
  return timeZones
    .map((id) => ({ id, label: timeZoneLabel(id, at), offset: offsetMinutes(id, at) }))
    .sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label, "de"))
    .map(({ id, label }) => ({ id, label }));
}
