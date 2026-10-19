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
