import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { PageShell } from "@/components/app/app-footer";
import { GuestTabs } from "@/components/guests/guest-tabs";
import { loadGuestPage } from "@/lib/guests";

export default async function GuestsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, page } = await loadGuestPage(id);
  const t = await getTranslations("guests");
  const base = `/websites/${id}/gaeste`;
  return (
    <PageShell header={<AppHeader email={user.email} />}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ChevronLeft className="size-4" aria-hidden />
            {t("backToDashboard")}
          </Link>
          <Link href={`/websites/${id}/edit`} className="text-primary hover:underline">
            {t("editWebsite")}
          </Link>
        </div>
        <div>
          <h1 className="font-heading text-5xl font-medium tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{page.website.title}</p>
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
