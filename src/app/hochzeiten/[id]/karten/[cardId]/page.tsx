import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CalendarClock, Eye, Globe, Lock } from "lucide-react";
import { markEngagementSharedAction } from "@/app/actions/cards";
import { NotFoundError } from "@/application/errors";
import { CardEditor } from "@/components/card-editor/card-editor";
import { ExportMenu } from "@/components/cards/export-menu";
import { ShareDialog } from "@/components/share/share-dialog";
import { VersionActions, VersionChips } from "@/components/weddings/versions";
import { WeddingDetailsButton } from "@/components/weddings/wedding-details-dialog";
import { WeddingNav } from "@/components/weddings/wedding-nav";
import { container } from "@/composition/container";
import { dateFromIso } from "@/lib/format";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; cardId: string }> };

async function load(id: string, cardId: string) {
  const user = await requireProfile();
  try {
    const data = await container().getCardEditor.execute(user.id, cardId);
    if (data.wedding.id !== id) notFound();
    return data;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, cardId } = await params;
  const data = await load(id, cardId);
  return { title: `${(await getTranslations("cardKinds"))(data.card.kind)} · ${data.wedding.title}` };
}

/** Designing and previewing a card version is free; links, export and sending need the card's package. */
export default async function CardEditorPage({ params }: Props) {
  const { id, cardId } = await params;
  const data = await load(id, cardId);
  const t = await getTranslations("cardEditor");
  const tKinds = await getTranslations("cardKinds");
  const tHome = await getTranslations("weddings.home");
  const format = await getFormatter();
  const { wedding, card } = data;
  const c = container();
  const timeZones = Intl.supportedValuesOf("timeZone");
  const base = `/hochzeiten/${id}/karten/${card.id}`;
  const kindName = tKinds(card.kind);
  const header = (
    <div className="space-y-4">
      <WeddingNav wedding={wedding} current={data.versions.length > 1 ? `${kindName} · ${card.label}` : kindName} />
      <div className="space-y-2">
        <h1 className="font-heading text-3xl font-medium tracking-tight">{kindName}</h1>
        {/* Names and date come from the wedding, so they can be changed here too. */}
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground" data-testid="wedding-details">
          <span>
            {wedding.title} · {wedding.weddingDate ? format.dateTime(dateFromIso(wedding.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : t("dateOpen")}
          </span>
          <WeddingDetailsButton wedding={wedding} appUrl={c.appUrl} timeZones={timeZones} variant="link" />
        </p>
      </div>
      <div className="space-y-2" data-testid="versions">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("versions")}</p>
          <VersionActions weddingId={id} item={card.kind} version={{ id: card.id, label: card.label }} deletable={data.versions.length > 1} />
        </div>
        <VersionChips weddingId={id} item={card.kind} versions={data.versions} current={card.id} canAdd={data.canAddVersion} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/vorschau`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm text-primary hover:bg-secondary/50">
          <Eye className="size-4" aria-hidden />
          {t("openPreview")}
        </Link>
        <ExportMenu exportUrl={`${base}/export`} active={data.active && !data.waitsForDate} />
        {data.publicUrl && data.active && (
          <ShareDialog
            url={data.publicUrl}
            slug={new URL(data.publicUrl).pathname.slice(1).replaceAll("/", "-")}
            title={tHome("shareTitle", { item: kindName })}
            message={card.message ?? data.defaultMessage}
            onShared={markEngagementSharedAction.bind(null, id, card.id)}
          />
        )}
      </div>
      {data.billingEnabled && !data.active && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="card-editor-locked">
          <Lock className="size-4 text-primary" aria-hidden />
          {t("locked")}
          <Link href="/preise" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("lockedLink")}
          </Link>
        </p>
      )}
      {data.waitsForDate && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-sm" data-testid="card-waits-for-date">
          <CalendarClock className="size-4 text-primary" aria-hidden />
          {t("waitsForDate")}
          <WeddingDetailsButton wedding={wedding} appUrl={c.appUrl} timeZones={timeZones} variant="link" label={t("setDate")} />
        </p>
      )}
      {data.offlineWebsites && (
        <p className="flex gap-2 rounded-xl border border-border bg-secondary/40 p-3 text-sm" data-testid="card-offline-websites">
          <Globe className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {t("offlineWebsites")}
        </p>
      )}
    </div>
  );
  // "Angaben ändern" may change the card's names and place: start the form again from the saved card.
  return <CardEditor key={`${card.id}|${wedding.title}|${wedding.weddingDate}|${wedding.location}`} data={data} locale={await getLocale()} header={header} />;
}
