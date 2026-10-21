import { getTranslations } from "next-intl/server";
import { GuestTabs } from "@/components/guests/guest-tabs";
import { loadGuestPage } from "@/lib/guests";

export default async function GuestsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadGuestPage(id);
  const t = await getTranslations("guests");
  const base = `/hochzeiten/${id}/gaeste`;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-heading text-4xl font-medium tracking-tight">{t("title")}</h1>
        <GuestTabs
          label={t("tabs.label")}
          tabs={[
            { href: base, label: t("tabs.overview") },
            { href: `${base}/einstellungen`, label: t("tabs.settings") },
            { href: `${base}/vorschau`, label: t("tabs.preview") },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
