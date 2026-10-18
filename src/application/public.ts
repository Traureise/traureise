import { buildAllDayIcs, buildIcs } from "@/domain/calendar";
import { slugify } from "@/domain/slug";
import type { Deps } from "./deps";
import { itemsOf, loadView, type WebsiteView } from "./views";

export class GetPublicWebsite {
  constructor(private deps: Deps) {}

  async execute(slug: string): Promise<WebsiteView | null> {
    const website = await this.deps.websites.findBySlug(slug);
    return website ? loadView(this.deps, website) : null;
  }
}

export class GetEventIcs {
  constructor(private deps: Deps) {}

  async execute(slug: string, itemId: string): Promise<{ filename: string; content: string } | null> {
    const view = await new GetPublicWebsite(this.deps).execute(slug);
    if (!view || !view.sections.find((s) => s.kind === "schedule")?.visible) return null;
    const event = itemsOf(view, "schedule").find((i) => i.id === itemId);
    if (!event) return null;
    const e = event.data;
    const content = buildIcs(
      {
        uid: `${event.id}@traureise`,
        title: e.name,
        description: e.description,
        location: [e.venueName, e.address].filter(Boolean).join(", "),
        start: { date: e.startDate, time: e.startTime },
        end: e.endDate && e.endTime ? { date: e.endDate, time: e.endTime } : null,
        timeZone: view.website.timezone,
        url: `${this.deps.appUrl}/${view.website.slug}`,
      },
      this.deps.clock.now(),
    );
    return { filename: `${slugify(e.name)}.ics`, content };
  }
}

export class GetWeddingIcs {
  constructor(private deps: Deps) {}

  /** The wedding day as an all-day event, for the Save the Date's "Zum Kalender hinzufügen". */
  async execute(slug: string): Promise<{ filename: string; content: string } | null> {
    const website = await this.deps.websites.findBySlug(slug);
    if (!website?.weddingDate) return null;
    const content = buildAllDayIcs(
      {
        uid: `${website.id}-wedding@traureise`,
        title: this.deps.cardTexts.calendarTitle.replace("{couple}", website.title),
        location: website.location ?? undefined,
        date: website.weddingDate,
        url: `${this.deps.appUrl}/${website.slug}`,
      },
      this.deps.clock.now(),
    );
    return { filename: `${website.slug}.ics`, content };
  }
}
