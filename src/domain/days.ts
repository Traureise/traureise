/** The calendar day (YYYY-MM-DD) of an instant in a time zone. */
export const localDay = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** A calendar day as a day count, so days can be subtracted. */
export const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** "12.06.2027" (also "1.6.27") → "2027-06-12"; null for anything else or a day that does not exist. */
export function isoFromGermanDate(input: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(input.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${y!.length === 2 ? `20${y}` : y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

/** "2027-06-01" → "01.06.2027". */
export const germanDate = (iso: string) => (iso ? iso.split("-").reverse().join(".") : "");

/** "9", "930", "9:30", "9.30" → "09:30" (24-hour); anything that is not a time stays as typed. */
export function normalizeTime(input: string): string {
  const raw = input.trim();
  const match = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(raw);
  if (!match) return raw;
  const [, h, m = "00"] = match;
  return Number(h) < 24 && Number(m) < 60 ? `${h!.padStart(2, "0")}:${m}` : raw;
}
