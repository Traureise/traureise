/**
 * Picks the UI language: an explicit choice (cookie) first, then the browser's Accept-Language
 * preferences, then the default. Only locales with a message catalogue are ever returned.
 */
export function resolveLocale<L extends string>(
  preferred: string | undefined,
  acceptLanguage: string | null | undefined,
  locales: readonly L[],
  defaultLocale: L,
): L {
  const match = (tag: string) => locales.find((l) => l === tag.toLowerCase() || l === tag.toLowerCase().split("-")[0]);
  if (preferred) {
    const chosen = match(preferred);
    if (chosen) return chosen;
  }
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      return { tag: tag.trim(), q: Number.isNaN(q) ? 0 : q };
    })
    .filter((x) => x.tag && x.tag !== "*" && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const found = match(tag);
    if (found) return found;
  }
  return defaultLocale;
}
