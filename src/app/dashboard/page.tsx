import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app/app-header";
import { CreateFirstButton } from "@/components/dashboard/create-first-button";
import { CreateMenu } from "@/components/dashboard/create-menu";
import { WebsiteCard } from "@/components/dashboard/website-card";
import { container } from "@/composition/container";
import { localize } from "@/domain/theme";
import { themeAssetUrl } from "@/lib/format";
import { requireProfile } from "@/lib/session";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "websites", label: "websites" },
  { id: "save-the-dates", label: "saveTheDates" },
  { id: "invitations", label: "invitations" },
  { id: "cards", label: "cards" },
  { id: "archived", label: "archived" },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireProfile();
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((x) => x.id === tabParam) ?? TABS[0];
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const c = container();
  const websites = tab.id === "websites" ? await c.listWebsites.execute(user.id) : [];
  // The default theme comes first and is preselected when creating a website.
  const defaultTheme = c.themes.defaultThemeId();
  const themes = [...c.themes.list()].sort((a, b) => Number(b.id === defaultTheme) - Number(a.id === defaultTheme)).map((theme) => ({
    id: theme.id,
    name: localize(theme.name, locale),
    preview: themeAssetUrl(theme.id, theme.assets.preview),
  }));

  return (
    <div className="min-h-dvh">
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-heading text-5xl font-medium tracking-tight sm:text-6xl">{t("greeting", { name: user.firstName })}</h1>
          <CreateMenu themes={themes} appUrl={c.appUrl} />
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
              <WebsiteCard key={website.id} website={website} appUrl={c.appUrl} />
            ))}
          </div>
        ) : (
          <section className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border px-6 py-14 sm:px-10" data-testid="empty-state">
            <p className="font-heading text-2xl">{t(`empty.${tab.label}`)}</p>
            {tab.id === "websites" ? (
              <CreateFirstButton themes={themes} appUrl={c.appUrl} />
            ) : (
              <p className="text-muted-foreground">{t("empty.comingSoon")}</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
