import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { WebsiteView } from "@/application/views";
import { renderableSections } from "@/application/views";
import { dateFromIso, daysUntil, uploadUrl } from "@/lib/format";
import { LEGAL_HREFS } from "@/components/app/app-footer";
import { container } from "@/composition/container";
import { siteStyle } from "./site-style";
import { SectionBody } from "./sections";

type Props = { view: WebsiteView; now: Date; mode: "public" | "preview" };

/** The guest-facing website. The editor preview renders exactly this component. */
export async function WeddingSite({ view, now, mode }: Props) {
  const t = await getTranslations("site");
  const legal = await container().legalPages.available();
  const format = await getFormatter();
  const { website, design } = view;
  const sections = renderableSections(view);
  const frame = design.theme.assets.heroFrame ? undefined : "none";
  const divider = design.theme.assets.divider ? undefined : "none";
  const days = website.weddingDate ? daysUntil(website.weddingDate, now, website.timezone) : null;

  return (
    <div className="site min-h-full" style={siteStyle(design)} data-theme={design.theme.id} data-palette={design.palette.id} data-fonts={design.fonts.id} data-testid={mode === "preview" ? "site-preview" : "site"}>
      <nav className="site-nav sticky top-0 z-10" aria-label={t("navLabel")}>
        <ul className="mx-auto flex max-w-4xl gap-5 overflow-x-auto px-6 py-3 text-sm whitespace-nowrap">
          <li>
            <a href="#start">{t("home")}</a>
          </li>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#s-${s.id}`}>{s.title}</a>
            </li>
          ))}
        </ul>
      </nav>

      <header id="start" className="mx-auto flex max-w-3xl scroll-mt-16 flex-col items-center gap-6 px-6 pt-12 pb-16 text-center">
        {website.coverImageKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uploadUrl(website.coverImageKey)} alt="" data-frame={frame} className="site-cover aspect-[4/5] w-full max-w-sm object-cover" />
        )}
        <h1 className="text-5xl sm:text-7xl" data-testid="site-title">
          {website.title}
        </h1>
        <p className="text-xl tracking-wide" data-testid="site-date">
          {website.weddingDate ? format.dateTime(dateFromIso(website.weddingDate), { dateStyle: "full", timeZone: "UTC" }) : t("dateOpen")}
        </p>
        <p className="site-muted" data-testid="site-location">
          {website.location ?? t("locationOpen")}
        </p>
        {website.showCountdown && days !== null && (
          <p className="site-eyebrow" data-testid="site-countdown">
            {days >= 0 ? t("countdown", { days }) : t("countdownPast")}
          </p>
        )}
        <div className="site-divider" data-frame={divider} aria-hidden />
        {website.welcomeMessage && <p className="max-w-prose text-lg whitespace-pre-line">{website.welcomeMessage}</p>}
        {website.hashtag && <p className="site-eyebrow">#{website.hashtag}</p>}
      </header>

      {sections.map((s) => (
        <section key={s.id} id={`s-${s.id}`} className="mx-auto max-w-3xl scroll-mt-16 px-6 py-14" data-testid="site-section" data-section-id={s.id}>
          <h2 className="mb-3 text-center text-4xl">{s.title}</h2>
          <div className="site-divider mb-10" data-frame={divider} aria-hidden />
          <SectionBody section={s} website={website} />
        </section>
      ))}

      <footer className="site-muted flex flex-wrap justify-center gap-x-4 gap-y-1 px-6 py-12 text-center text-xs" data-testid="site-footer">
        <span>{t("madeWith")}</span>
        {legal.map((page) => (
          <Link key={page} href={LEGAL_HREFS[page]} target={mode === "preview" ? "_blank" : undefined} className="underline-offset-4 hover:underline">
            {t(page)}
          </Link>
        ))}
      </footer>
    </div>
  );
}
