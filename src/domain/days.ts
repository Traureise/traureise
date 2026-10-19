/** The calendar day (YYYY-MM-DD) of an instant in a time zone. */
export const localDay = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** A calendar day as a day count, so days can be subtracted. */
export const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
