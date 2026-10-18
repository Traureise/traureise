export const SLUG_MIN = 3;
export const SLUG_MAX = 60;

/** Top-level paths owned by the app; a website slug may never shadow them. */
export const RESERVED_SLUGS = [
  "api",
  "auth",
  "dashboard",
  "websites",
  "login",
  "logout",
  "willkommen",
  "uploads",
  "theme-assets",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "static",
  "public",
  "admin",
  "impressum",
  "datenschutz",
  "preise",
  "konto",
  "hilfe",
  "_next",
] as const;

export type SlugError = "too_short" | "too_long" | "invalid" | "reserved";

const GERMAN = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" } as const;

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => GERMAN[c as keyof typeof GERMAN])
    .replace(/&/g, " und ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return slug.length >= SLUG_MIN ? slug : "hochzeit";
}

export function validateSlug(slug: string): SlugError | null {
  if (slug.length < SLUG_MIN) return "too_short";
  if (slug.length > SLUG_MAX) return "too_long";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "invalid";
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return "reserved";
  return null;
}
