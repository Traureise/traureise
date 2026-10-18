import { SECTION_KINDS, type CollectionKind, type SectionKind } from "@/domain/sections";
import { resolveDesign, type ResolvedDesign } from "@/domain/theme";
import type { Deps } from "./deps";
import type { Item, Section, Website } from "./ports";

export type WebsiteView = { website: Website; sections: Section[]; items: Item[]; design: ResolvedDesign };

export async function loadView(deps: Deps, website: Website): Promise<WebsiteView> {
  const [sections, items] = await Promise.all([deps.websites.listSections(website.id), deps.websites.listItems(website.id)]);
  const theme = deps.themes.get(website.themeId) ?? deps.themes.get(deps.themes.defaultThemeId())!;
  const order = (kind: SectionKind) => SECTION_KINDS.indexOf(kind);
  return {
    website,
    sections: [...sections].sort((a, b) => order(a.kind) - order(b.kind)),
    items: [...items].sort((a, b) => a.position - b.position),
    design: resolveDesign(theme, website.paletteId, website.fontPairingId),
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
