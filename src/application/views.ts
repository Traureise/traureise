import { groupBlocks, type BlockType } from "@/domain/sections";
import { resolveDesign, type ResolvedDesign } from "@/domain/theme";
import type { Deps } from "./deps";
import type { Block, Section, SiteData, Website, Wedding, WeddingEvent } from "./ports";

export type SectionView = Section & { blocks: Block[] };

/** A website version with its sections and blocks in order, and the wedding's events (chronological). */
export type WebsiteView = { wedding: Wedding; website: SiteData; sections: SectionView[]; events: WeddingEvent[]; design: ResolvedDesign };

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
  const [sections, blocks, events] = await Promise.all([deps.websites.listSections(website.id), deps.websites.listBlocks(website.id), deps.weddings.listEvents(wedding.id)]);
  return {
    wedding,
    website: siteData(wedding, website),
    sections: sections.map((s) => ({ ...s, blocks: blocks.filter((b) => b.sectionId === s.id) })),
    events,
    design: designOf(deps, website),
  };
}

/** Consecutive blocks of one type, as the site renders them; event blocks resolve to the events they show. */
export type RenderGroup = { type: "event"; events: WeddingEvent[] } | { type: Exclude<BlockType, "event">; blocks: Block[] };

export type RenderableSection = { id: string; title: string; groups: RenderGroup[] };

/**
 * The events of consecutive event blocks, in block order: "Alle Termine" expands to every event
 * (chronologically), an event that no longer exists is skipped, and no event is listed twice.
 */
function resolveEvents(blocks: Block[], events: WeddingEvent[]): WeddingEvent[] {
  const result: WeddingEvent[] = [];
  const add = (e: WeddingEvent | undefined) => {
    if (e && !result.includes(e)) result.push(e);
  };
  for (const block of blocks) {
    if (block.data.type !== "event") continue;
    const { eventId } = block.data;
    if (eventId === null) events.forEach(add);
    else add(events.find((e) => e.id === eventId));
  }
  return result;
}

/** What guests see: visible sections with something to show, in order. Empty groups and sections are left out. */
export function renderableSections(view: Pick<WebsiteView, "sections" | "events">): RenderableSection[] {
  return view.sections
    .filter((s) => s.visible)
    .map((s) => ({
      id: s.id,
      title: s.title,
      groups: groupBlocks(s.blocks)
        .map((blocks): RenderGroup => {
          const type = blocks[0]!.data.type;
          return type === "event" ? { type, events: resolveEvents(blocks, view.events) } : { type, blocks };
        })
        .filter((g) => (g.type === "event" ? g.events.length > 0 : g.blocks.length > 0)),
    }))
    .filter((s) => s.groups.length > 0);
}

/** The events the site shows somewhere (for calendar downloads). */
export function shownEventIds(view: Pick<WebsiteView, "sections" | "events">): Set<string> {
  const ids = new Set<string>();
  for (const section of renderableSections(view)) for (const group of section.groups) if (group.type === "event") for (const e of group.events) ids.add(e.id);
  return ids;
}
