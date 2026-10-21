import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { SettingsSection } from "@/components/app/settings-section";
import { DeleteWeddingButton } from "@/components/weddings/delete-wedding-button";
import { WeddingDetailsForm } from "@/components/weddings/wedding-details-form";
import { container } from "@/composition/container";
import { timeZoneOptions } from "@/lib/format";
import { loadWeddingFrame } from "@/lib/weddings";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ zurueck?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wedding } = await loadWeddingFrame((await params).id);
  return { title: `${(await getTranslations("weddings.details"))("title")} · ${wedding.title}` };
}

/** The Hochzeit tab: names, date, place, time zone and address, which every card and website version share. */
export default async function WeddingDetailsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { zurueck } = await searchParams;
  const { wedding } = await loadWeddingFrame(id);
  const t = await getTranslations("weddings.details");
  // Only back into this wedding (a card or the website editor), never elsewhere.
  const back = zurueck?.startsWith(`/hochzeiten/${id}/`) && !zurueck.includes("//") ? zurueck : null;
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-heading text-4xl font-medium tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </header>
      <div className="space-y-8">
        <div className="rounded-3xl border border-border bg-card px-6 sm:px-10" data-testid="wedding-details">
          <WeddingDetailsForm wedding={wedding} appUrl={container().appUrl} timeZones={timeZoneOptions()} back={back} />
        </div>
        <div className="rounded-3xl border border-border bg-card px-6 sm:px-10">
          <SettingsSection id="wedding-delete" icon={<Trash2 />} tone="danger" title={t("sections.delete.title")} description={t("sections.delete.lead")}>
            <DeleteWeddingButton weddingId={wedding.id} title={wedding.title} />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
