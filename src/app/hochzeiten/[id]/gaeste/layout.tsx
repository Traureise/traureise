import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app/app-header";
import { PageShell } from "@/components/app/app-footer";
import { GuestTabs } from "@/components/guests/guest-tabs";
import { WeddingNav } from "@/components/weddings/wedding-nav";
import { loadGuestPage } from "@/lib/guests";

export default async function GuestsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, page } = await loadGuestPage(id);
  const t = await getTranslations("guests");
  const base = `/hochzeiten/${id}/gaeste`;
  return (
    <PageShell header={<AppHeader email={user.email} />}>
      <div className="space-y-8">
        <WeddingNav wedding={page.wedding} current={t("title")} />
        <div>
          <h1 className="font-heading text-5xl font-medium tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{page.wedding.title}</p>
        </div>
        <GuestTabs
          label={t("tabs.label")}
          tabs={[
            { href: base, label: t("tabs.overview") },
            { href: `${base}/einstellungen`, label: t("tabs.settings") },
            { href: `${base}/vorschau`, label: t("tabs.preview") },
          ]}
        />
        {children}
      </div>
    </PageShell>
  );
}
