import { buildAllDayIcs, buildIcs } from "@/domain/calendar";
import { slugify } from "@/domain/slug";
import { firstVersion } from "@/domain/weddings";
import { weddingBySlug } from "./cards";
import type { Deps } from "./deps";
import { loadGuestContext } from "./guest-context";
import { itemsOf, loadView, type WebsiteView } from "./views";

export class GetPublicWebsite {
  constructor(private deps: Deps) {}

  /**
   * `/<slug>`: the website version with that slug, if it is online. A slug that is only a wedding's shows that
   * wedding's first online version. Drafts, and extra versions without a paid package, are a 404.
   */
  async execute(slug: string): Promise<WebsiteView | null> {
    const own = await this.deps.websites.findBySlug(slug);
    const wedding = own ? await this.deps.weddings.findById(own.weddingId) : await this.deps.weddings.findBySlug(slug);
    if (!wedding) return null;
    const ctx = await loadGuestContext(this.deps, wedding);
    const website = own ? ctx.websites.find((w) => w.id === own.id) : ctx.websites.find((w) => ctx.online(w));
    return website && ctx.online(website) ? loadView(this.deps, wedding, website) : null;
  }
}

export class GetEventIcs {
  constructor(private deps: Deps) {}

  /** An event's calendar file, for an event the public website shows. */
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
    const wedding = await weddingBySlug(this.deps, slug);
    if (!wedding?.weddingDate) return null;
    const ctx = await loadGuestContext(this.deps, wedding);
    const website = firstVersion(ctx.websites.filter((w) => ctx.online(w)));
    const content = buildAllDayIcs(
      {
        uid: `${wedding.id}-wedding@traureise`,
        title: this.deps.cardTexts.calendarTitle.replace("{couple}", wedding.title),
        location: wedding.location ?? undefined,
        date: wedding.weddingDate,
        url: website ? `${this.deps.appUrl}/${website.slug}` : undefined,
      },
      this.deps.clock.now(),
    );
    return { filename: `${wedding.slug}.ics`, content };
  }
}
