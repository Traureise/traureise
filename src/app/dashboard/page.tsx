import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppFooter } from "@/components/app/app-footer";
import { AppHeader } from "@/components/app/app-header";
import { CardItem } from "@/components/dashboard/card-item";
import { CreateFirstButton } from "@/components/dashboard/create-first-button";
import { CreateCardButton, CreateMenu } from "@/components/dashboard/create-menu";
import { WebsiteCard } from "@/components/dashboard/website-card";
import { container } from "@/composition/container";
import type { CardKind } from "@/domain/cards";
import { localize } from "@/domain/theme";
import { themeAssetUrl } from "@/lib/format";
import { requireProfile } from "@/lib/session";
import { cn } from "@/lib/utils";

/** In the order a couple goes through them (my call). */
const TABS: { id: string; label: string; kinds: CardKind[] }[] = [
  { id: "engagement", label: "engagement", kinds: ["engagement"] },
  { id: "save-the-dates", label: "saveTheDates", kinds: ["saveTheDate"] },
  { id: "websites", label: "websites", kinds: [] },
  { id: "invitations", label: "invitations", kinds: ["invitation"] },
  { id: "thank-you", label: "thankYou", kinds: ["thankYou"] },
];
const WEBSITES = TABS[2]!;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string; kauf?: string }> }) {
  const user = await requireProfile();
  const { tab: tabParam, kauf } = await searchParams;
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const c = container();
  const websites = await c.listWebsites.execute(user.id);
  const choices = websites.map((w) => ({ id: w.id, title: w.title }));
  const drafts = websites.filter((w) => !w.siteEnabled).map((w) => ({ id: w.id, title: w.title, weddingDate: w.weddingDate, slug: w.slug }));
  const allCards = await c.listCards.execute(user.id);
  // Without a choice: the websites if there is one, else the first tab with a card, else the websites.
  const tab =
    TABS.find((x) => x.id === tabParam) ??
    (websites.some((w) => w.siteEnabled) ? WEBSITES : (TABS.find((x) => allCards.some((card) => x.kinds.includes(card.kind))) ?? WEBSITES));
  const cards = allCards.filter((card) => tab.kinds.includes(card.kind));
  const tKinds = await getTranslations("cardKinds");
  // Plans exist only with billing on; self-hosted instances never show tiers.
  const plans = new Map((await c.listWebsitePlans.execute(user.id)).map((p) => [p.websiteId, p.tier]));
  // The default theme comes first and is preselected when creating a website.
  const defaultTheme = c.themes.defaultThemeId();
  const themes = [...c.themes.list()].sort((a, b) => Number(b.id === defaultTheme) - Number(a.id === defaultTheme)).map((theme) => ({
    id: theme.id,
    name: localize(theme.name, locale),
    preview: themeAssetUrl(theme.id, theme.assets.preview),
  }));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader email={user.email} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-10 sm:px-6">
        {kauf === "danke" && (
          <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="purchase-thanks">
            {t("purchaseThanks")}
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-heading text-5xl font-medium tracking-tight sm:text-6xl">{t("greeting", { name: user.firstName })}</h1>
          <CreateMenu themes={themes} appUrl={c.appUrl} websites={choices} drafts={drafts} />
        </div>

        <nav aria-label={t("title")} className="-mx-1 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((x) => (
            <Link
              key={x.id}
              href={`/dashboard?tab=${x.id}`}
              aria-current={x.id === tab.id ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors",
                x.id === tab.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`tabs.${x.label}`)}
            </Link>
          ))}
        </nav>

        {tab.id === "websites" && websites.length > 0 ? (
          <div className="space-y-6">
            {websites.map((website) => (
              <WebsiteCard key={website.id} website={website} appUrl={c.appUrl} tier={plans.get(website.id)} themes={themes} />
            ))}
          </div>
        ) : cards.length > 0 ? (
          <div className="space-y-6">
            {cards.map((card) => (
              <CardItem key={`${card.websiteId}-${card.kind}`} card={card} billingEnabled={c.billingEnabled} />
            ))}
          </div>
        ) : (
          <section className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border px-6 py-14 sm:px-10" data-testid="empty-state">
            <p className="font-heading text-2xl">{t(`empty.${tab.label}`)}</p>
            {tab.id === "websites" ? (
              <CreateFirstButton themes={themes} appUrl={c.appUrl} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {tab.kinds.map((kind) => (
                  <CreateCardButton key={kind} kind={kind} label={t("createCard.button", { kind: tKinds(kind) })} websites={choices} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <AppFooter />
    </div>
  );
}
