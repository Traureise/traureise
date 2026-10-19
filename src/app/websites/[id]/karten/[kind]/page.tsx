import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, Eye, Lock } from "lucide-react";
import { NotFoundError } from "@/application/errors";
import { CardEditor } from "@/components/card-editor/card-editor";
import { WeddingDetailsButton } from "@/components/dashboard/wedding-details-button";
import { container } from "@/composition/container";
import { cardKindFromSlug, CARD_SLUGS, type CardKind } from "@/domain/cards";
import { dateFromIso } from "@/lib/format";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; kind: string }> };

const DASHBOARD_TAB: Record<CardKind, string> = { engagement: "engagement", saveTheDate: "save-the-dates", invitation: "invitations", thankYou: "thank-you" };

async function load(id: string, slug: string) {
  const user = await requireProfile();
  const kind = cardKindFromSlug(slug);
  if (!kind) notFound();
  try {
    return await container().getCardEditor.execute(user.id, id, kind);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, kind } = await params;
  const data = await load(id, kind);
  return { title: `${(await getTranslations("cardKinds"))(data.card.kind)} · ${data.website.title}` };
}

/** Designing and previewing a card is free; links, export and sending need the card's package. */
export default async function CardEditorPage({ params }: Props) {
  const { id, kind: slug } = await params;
  const data = await load(id, slug);
  const t = await getTranslations("cardEditor");
  const tKinds = await getTranslations("cardKinds");
  const format = await getFormatter();
  const { website } = data;
  const header = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/dashboard?tab=${DASHBOARD_TAB[data.card.kind]}`} className="inline-flex items-center gap-1 text-primary hover:underline">
          <ChevronLeft className="size-4" aria-hidden />
          {t("back")}
        </Link>
        <Link href={`/websites/${id}/karten/${CARD_SLUGS[data.card.kind]}/vorschau`} className="inline-flex items-center gap-1 text-primary hover:underline">
          <Eye className="size-4" aria-hidden />
          {t("openPreview")}
        </Link>
      </div>
      <div>
        <h1 className="font-heading text-3xl font-medium tracking-tight">{tKinds(data.card.kind)}</h1>
        {/* Names and date come from the wedding, so they can be changed here even without a website. */}
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground" data-testid="wedding-details">
          <span>
            {website.title} · {website.weddingDate ? format.dateTime(dateFromIso(website.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : t("dateOpen")}
          </span>
          <WeddingDetailsButton wedding={website} variant="link" />
        </p>
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
    </div>
  );
  return <CardEditor data={data} locale={await getLocale()} header={header} />;
}
