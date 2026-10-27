import { getTranslations } from "next-intl/server";
import { CalendarClock, Heart, ListChecks, Users } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { PageShell } from "@/components/app/app-footer";
import { WeddingNav } from "@/components/weddings/wedding-nav";
import { WeddingSwitcher } from "@/components/weddings/wedding-switcher";
import { WeddingTabs } from "@/components/weddings/wedding-tabs";
import { loadWeddingFrame } from "@/lib/weddings";

/** Every tab of a wedding: the way back, the switcher and the tabs, then the tab's own page. */
export default async function WeddingTabsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, wedding, others } = await loadWeddingFrame(id);
  const t = await getTranslations("weddings.tabs");
  const base = `/hochzeiten/${id}`;
  return (
    <PageShell header={<AppHeader email={user.email} />}>
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <WeddingNav wedding={wedding} />
            <WeddingSwitcher current={wedding.title} role={wedding.role} others={others} />
          </div>
          <WeddingTabs
            label={t("label")}
            tabs={[
              { href: base, label: t("preparation"), icon: <ListChecks aria-hidden />, testId: "tab-preparation", exact: true },
              { href: `${base}/hochzeit`, label: t("wedding"), icon: <Heart aria-hidden />, testId: "tab-wedding" },
              { href: `${base}/gaeste`, label: t("guests"), icon: <Users aria-hidden />, testId: "tab-guests" },
              { href: `${base}/ablauf`, label: t("schedule"), icon: <CalendarClock aria-hidden />, testId: "tab-schedule" },
            ]}
          />
        </div>
        {children}
      </div>
    </PageShell>
  );
}
