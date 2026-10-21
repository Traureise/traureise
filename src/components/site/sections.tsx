import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarPlus, ExternalLink, MapPinned } from "lucide-react";
import type { Block, Website, WeddingEvent } from "@/application/ports";
import type { RenderableSection, RenderGroup } from "@/application/views";
import { mapLink } from "@/domain/calendar";
import { dateFromIso, uploadUrl } from "@/lib/format";

type Blocks<T extends Exclude<RenderGroup["type"], "event">> = Block<T>[];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Img({ imageKey, className }: { imageKey: string | null; className: string }) {
  if (!imageKey) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={uploadUrl(imageKey)} alt="" className={className} loading="lazy" />;
}

async function WebsiteLink({ url }: { url: string | null }) {
  const t = await getTranslations("site");
  if (!url) return null;
  return (
    <a href={url} className="site-button" target="_blank" rel="noopener noreferrer">
      <ExternalLink className="size-4" aria-hidden />
      {t("website")}
    </a>
  );
}

async function MapButton({ address, at }: { address: string; at?: { latitude: number | null; longitude: number | null } }) {
  const t = await getTranslations("site");
  if (!address && typeof at?.latitude !== "number") return null;
  return (
    <a href={mapLink(address, at)} className="site-button" target="_blank" rel="noopener noreferrer">
      <MapPinned className="size-4" aria-hidden />
      {t("showMap")}
    </a>
  );
}

async function Events({ events, website }: { events: WeddingEvent[]; website: Website }) {
  const t = await getTranslations("site");
  const tTypes = await getTranslations("sections.eventTypes");
  const format = await getFormatter();
  const day = (iso: string, style: "long" | "full") => format.dateTime(dateFromIso(iso), { dateStyle: style, timeZone: "UTC" });
  return (
    <ol className="space-y-6">
      {events.map(({ id, data: e }) => (
        <li key={id} className="site-surface grid gap-5 rounded-2xl p-6 sm:grid-cols-[auto_1fr]" data-testid="site-event">
          <div className="text-center sm:w-24">
            <div className="text-4xl" style={{ fontFamily: "var(--site-heading)" }}>
              {e.startTime}
            </div>
            <div className="site-muted text-sm">{day(e.startDate, "long")}</div>
          </div>
          <div className="space-y-2">
            <p className="site-eyebrow">{tTypes(e.eventType)}</p>
            <h3 className="text-2xl">{e.name}</h3>
            <p className="site-muted text-sm">
              {e.endDate && e.endTime
                ? e.endDate === e.startDate
                  ? `${e.startTime} – ${t("oclock", { time: e.endTime })}`
                  : `${day(e.startDate, "long")}, ${e.startTime} – ${day(e.endDate, "long")}, ${t("oclock", { time: e.endTime })}`
                : t("oclock", { time: e.startTime })}
            </p>
            {(e.venueName || e.address) && (
              <p>
                {e.venueName && <span className="block font-medium">{e.venueName}</span>}
                {e.address && <span className="site-muted block whitespace-pre-line">{e.address}</span>}
              </p>
            )}
            {e.description && <p className="whitespace-pre-line">{e.description}</p>}
            <Img imageKey={e.imageKey} className="max-h-72 w-full rounded-xl object-cover" />
            <div className="flex flex-wrap gap-2 pt-1">
              <MapButton address={[e.venueName, e.address].filter(Boolean).join(", ")} at={e} />
              <a href={`/${website.slug}/kalender/${id}`} className="site-button" download>
                <CalendarPlus className="size-4" aria-hidden />
                {t("addToCalendar")}
              </a>
              <WebsiteLink url={e.website} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Texts({ blocks }: { blocks: Blocks<"text"> }) {
  return (
    <div className="mx-auto max-w-prose space-y-6">
      {blocks.map(({ id, data: x }) => (
        <p key={id} className="text-lg whitespace-pre-line">
          {x.text}
        </p>
      ))}
    </div>
  );
}

async function Places({ blocks }: { blocks: Blocks<"place"> }) {
  const tTypes = await getTranslations("sections.placeTypes");
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {blocks.map(({ id, data: x }) => (
        <article key={id} className="site-surface space-y-2 rounded-2xl p-6" data-testid="site-place">
          <p className="site-eyebrow">{tTypes(x.placeType)}</p>
          <h3 className="text-2xl">{x.name}</h3>
          {x.address && <p className="site-muted whitespace-pre-line">{x.address}</p>}
          {x.description && <p className="whitespace-pre-line">{x.description}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <MapButton address={x.address} />
            <WebsiteLink url={x.website} />
          </div>
        </article>
      ))}
    </div>
  );
}

function Links({ blocks }: { blocks: Blocks<"link"> }) {
  return (
    <ul className="space-y-4">
      {blocks.map(({ id, data: x }) => (
        <li key={id} className="site-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
          <div className="space-y-1">
            <h3 className="text-2xl">{x.name}</h3>
            {x.description && <p className="whitespace-pre-line">{x.description}</p>}
          </div>
          <a href={x.url} className="site-button" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" aria-hidden />
            {hostOf(x.url)}
          </a>
        </li>
      ))}
    </ul>
  );
}

async function Persons({ blocks }: { blocks: Blocks<"person"> }) {
  const tRoles = await getTranslations("sections.roles");
  return (
    <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3">
      {blocks.map(({ id, data: p }) => (
        <li key={id} className="flex flex-col items-center gap-3 text-center">
          {p.imageKey ? (
            <Img imageKey={p.imageKey} className="aspect-square w-32 rounded-full object-cover" />
          ) : (
            <span aria-hidden className="flex aspect-square w-32 items-center justify-center rounded-full text-4xl site-surface" style={{ fontFamily: "var(--site-heading)" }}>
              {p.name.slice(0, 1)}
            </span>
          )}
          <span className="text-lg font-medium">{p.name}</span>
          <span className="site-eyebrow">{tRoles(p.role)}</span>
          {p.text && <p className="site-muted text-sm whitespace-pre-line">{p.text}</p>}
        </li>
      ))}
    </ul>
  );
}

function Gallery({ blocks }: { blocks: Blocks<"image"> }) {
  return (
    <div className="columns-1 gap-4 sm:columns-2">
      {blocks.map(({ id, data: g }) => (
        <figure key={id} className="mb-4 break-inside-avoid">
          <Img imageKey={g.imageKey} className="w-full rounded-xl" />
          {g.caption && <figcaption className="site-muted mt-2 text-sm">{g.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

function Faqs({ blocks }: { blocks: Blocks<"faq"> }) {
  return (
    <dl className="space-y-8">
      {blocks.map(({ id, data: f }) => (
        <div key={id} className="space-y-2">
          <dt className="text-2xl" style={{ fontFamily: "var(--site-heading)" }}>
            {f.question}
          </dt>
          <dd className="whitespace-pre-line">{f.answer}</dd>
          <dd>
            <Img imageKey={f.imageKey} className="max-h-72 rounded-xl object-cover" />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Group({ group, website }: { group: RenderGroup; website: Website }) {
  switch (group.type) {
    case "event":
      return <Events events={group.events} website={website} />;
    case "text":
      return <Texts blocks={group.blocks as Blocks<"text">} />;
    case "person":
      return <Persons blocks={group.blocks as Blocks<"person">} />;
    case "place":
      return <Places blocks={group.blocks as Blocks<"place">} />;
    case "link":
      return <Links blocks={group.blocks as Blocks<"link">} />;
    case "faq":
      return <Faqs blocks={group.blocks as Blocks<"faq">} />;
    case "image":
      return <Gallery blocks={group.blocks as Blocks<"image">} />;
  }
}

/** A section's blocks: consecutive blocks of one type form one designed group (a grid, a list, a gallery). */
export function SectionBody({ section, website }: { section: RenderableSection; website: Website }) {
  return (
    <div className="space-y-10">
      {section.groups.map((group, i) => (
        <Group key={i} group={group} website={website} />
      ))}
    </div>
  );
}
