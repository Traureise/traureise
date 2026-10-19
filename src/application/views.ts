import { SECTION_KINDS, type CollectionKind, type SectionKind } from "@/domain/sections";
import { resolveDesign, type ResolvedDesign } from "@/domain/theme";
import type { Deps } from "./deps";
import type { Item, Section, SiteData, Website, Wedding } from "./ports";

/**
 * A website version as the site shows it. `items` holds the version's own items and the wedding's events it
 * shows (as schedule items); `events` is every event of the wedding, for the editor.
 */
export type WebsiteView = { wedding: Wedding; website: SiteData; sections: Section[]; items: Item[]; events: Item<"schedule">[]; design: ResolvedDesign };

export const siteData = (wedding: Wedding, website: Website): SiteData => ({
  ...website,
  title: wedding.title,
  weddingDate: wedding.weddingDate,
  location: wedding.location,
  timezone: wedding.timezone,
});

export function designOf(deps: Deps, website: Pick<Website, "themeId" | "paletteId" | "fontPairingId">): ResolvedDesign {
  const theme = deps.themes.get(website.themeId) ?? deps.themes.get(deps.themes.defaultThemeId())!;
  return resolveDesign(theme, website.paletteId, website.fontPairingId);
}

export async function loadView(deps: Deps, wedding: Wedding, website: Website): Promise<WebsiteView> {
  const [sections, items, events] = await Promise.all([deps.websites.listSections(website.id), deps.websites.listItems(website.id), deps.weddings.listEvents(wedding.id)]);
  const order = (kind: SectionKind) => SECTION_KINDS.indexOf(kind);
  const shown = events.filter((e) => !website.hiddenEventIds.includes(e.id));
  return {
    wedding,
    website: siteData(wedding, website),
    sections: [...sections].sort((a, b) => order(a.kind) - order(b.kind)),
    items: [...items.filter((i) => i.kind !== "schedule"), ...shown].sort((a, b) => a.position - b.position),
    events,
    design: designOf(deps, website),
  };
}

export function itemsOf<K extends CollectionKind>(view: Pick<WebsiteView, "items">, kind: K): Item<K>[] {
  return view.items.filter((i): i is Item<K> => i.kind === kind);
}

export type RenderableSection = Section & { items: Item[] };

/** What guests see: visible sections that have something to show, in the fixed order. Hidden ones never render. */
export function renderableSections(view: Pick<WebsiteView, "sections" | "items">): RenderableSection[] {
  return view.sections
    .filter((s) => s.visible)
    .map((s) => ({ ...s, items: s.kind === "our-story" ? [] : itemsOf(view, s.kind) }))
    .filter((s) => (s.kind === "our-story" ? s.body.trim() !== "" : s.items.length > 0));
}
