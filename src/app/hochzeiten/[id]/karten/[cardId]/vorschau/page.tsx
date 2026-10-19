import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { NotFoundError } from "@/application/errors";
import { CardList } from "@/components/cards/household-letters";
import { Letter } from "@/components/cards/letter";
import { GuestForm } from "@/components/guests/guest-form";
import { GuestSite } from "@/components/guests/guest-site";
import { container } from "@/composition/container";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; cardId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cardEditor"))("previewTitle"), robots: { index: false, follow: false } };
}

/** The card as a household sees it, envelope included. Free, and it never counts as opened. */
export default async function CardPreviewPage({ params }: Props) {
  const { id, cardId } = await params;
  const user = await requireProfile();
  let view;
  try {
    view = await container().getCardPreview.execute(user.id, cardId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const t = await getTranslations("cardEditor");
  const tAuth = await getTranslations("auth");
  return (
    <GuestSite design={view.design}>
      <p className="flex flex-wrap items-center justify-center gap-3 bg-black/80 px-4 py-2 text-center text-sm text-white" data-testid="card-preview-note">
        <Link href={`/hochzeiten/${id}/karten/${cardId}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
          <ChevronLeft className="size-4" aria-hidden />
          {t("backToEditor")}
        </Link>
        <Link href={`/hochzeiten/${id}`} className="underline-offset-4 hover:underline" data-testid="preview-wedding-link">
          {view.website.title}
        </Link>
        <Link href="/hochzeiten" className="underline-offset-4 hover:underline">
          {tAuth("weddings")}
        </Link>
        <span>{t("previewNote")}</span>
      </p>
      <Letter envelope={view.envelope} greeting={view.greeting} openedUrl={null} kinds={[]}>
        <CardList cards={view.cards} formAnchor={view.form ? "antwort" : null} />
        {view.form && (
          <div id="antwort">
            <GuestForm form={view.form} token={null} belowCards={view.cards.length > 0} />
          </div>
        )}
      </Letter>
    </GuestSite>
  );
}
