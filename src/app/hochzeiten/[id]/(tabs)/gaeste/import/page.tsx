import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, FileSpreadsheet } from "lucide-react";
import { GuestImport } from "@/components/guests/guest-import";
import { Button } from "@/components/ui/button";
import { loadGuestPage } from "@/lib/guests";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await loadGuestPage((await params).id);
  return { title: `${(await getTranslations("guests.import"))("title")} · ${page.wedding.title}` };
}

/** Upload a spreadsheet, review what it would change, and import it. */
export default async function GuestImportPage({ params }: Props) {
  const { id } = await params;
  const { page } = await loadGuestPage(id);
  const t = await getTranslations("guests.import");
  const base = `/hochzeiten/${id}/gaeste`;
  return (
    <div className="space-y-6">
      <Link href={base} className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
        <ChevronLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-3xl font-medium">{t("title")}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t("lead")}</p>
        </div>
        <Button asChild variant="outline">
          <a href={`${base}/vorlage`} download>
            <FileSpreadsheet aria-hidden />
            {t("template")}
          </a>
        </Button>
      </div>
      <GuestImport weddingId={id} events={page.events.map(({ id, name }) => ({ id, name }))} />
    </div>
  );
}
