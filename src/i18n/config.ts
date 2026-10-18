/** Locales with a complete catalogue in messages/<locale>.json. Add a catalogue, then list it here. */
export const locales = ["de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";
/** Optional cookie with an explicit language choice. */
export const LOCALE_COOKIE = "traureise_locale";
