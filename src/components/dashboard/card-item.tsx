import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eye, Lock, PencilLine, Send } from "lucide-react";
import type { CardSummary } from "@/application/cards";
import { CardFrame } from "@/components/cards/card-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CARD_SLUGS } from "@/domain/cards";
import { DeleteCardButton, ExportMenu } from "./card-actions";
import { ShareDialog } from "./share-dialog";

/** A card on the dashboard: preview, status counts and Bearbeiten / Ansehen / Teilen / Exportieren / Löschen. */
export async function CardItem({ card, billingEnabled }: { card: CardSummary; billingEnabled: boolean }) {
  const t = await getTranslations("dashboard.cardItem");
  const tKinds = await getTranslations("cardKinds");
  const base = `/websites/${card.websiteId}/karten/${CARD_SLUGS[card.kind]}`;
  const kindName = tKinds(card.kind);
  // Inactive: the package is missing (or, for household cards, the guest data is gone after the wedding).
  const locked = !card.active;
  return (
    <article className="grid gap-6 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[180px_1fr] sm:p-6" data-testid="card-item" data-kind={card.kind}>
      <CardFrame model={card.model} className="w-40 sm:w-full" label={t("previewAlt", { kind: kindName, title: card.websiteTitle })} />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{card.websiteTitle}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-3xl font-medium tracking-tight">{kindName}</h2>
            {locked && billingEnabled && (
              <Badge variant="outline" data-testid="card-locked">
                <Lock aria-hidden />
                {t("locked")}
              </Badge>
            )}
          </div>
        </div>
        {card.counts && (
          <p className="text-sm" data-testid="card-counts">
            {t("counts", card.counts)}
          </p>
        )}
        {card.publicUrl && !locked && (
          <a href={card.publicUrl} className="truncate text-sm text-primary underline-offset-4 hover:underline" data-testid="card-public-url">
            {card.publicUrl}
          </a>
        )}
        <div className="mt-auto flex flex-wrap gap-2">
          <Button asChild>
            <Link href={base}>
              <PencilLine aria-hidden />
              {t("edit")}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`${base}/vorschau`}>
              <Eye aria-hidden />
              {t("view")}
            </Link>
          </Button>
          {locked ? (
            <Button asChild variant="outline">
              <Link href="/preise">
                <Lock aria-hidden />
                {t("share")}
              </Link>
            </Button>
          ) : card.publicUrl ? (
            <ShareDialog url={card.publicUrl} slug={`${card.websiteId}-${card.kind}`} title={t("shareTitle", { kind: kindName })} />
          ) : (
            <Button asChild variant="outline">
              <Link href={`/websites/${card.websiteId}/gaeste?karte=${card.kind}`}>
                <Send aria-hidden />
                {t("share")}
              </Link>
            </Button>
          )}
          <ExportMenu exportUrl={`${base}/export`} active={!locked} />
          <div className="sm:ml-auto">
            <DeleteCardButton websiteId={card.websiteId} kind={card.kind} name={kindName} />
          </div>
        </div>
      </div>
    </article>
  );
}
