import { getTranslations } from "next-intl/server";
import { CalendarPlus, ExternalLink, MessageSquareReply } from "lucide-react";
import type { PageCard } from "@/application/cards";
import { CardFrame } from "./card-frame";

/** The cards on a household's page (or the engagement page), newest first, each with its buttons. */
export async function CardList({ cards, formAnchor }: { cards: PageCard[]; formAnchor: string | null }) {
  const t = await getTranslations("letter");
  return (
    <div className="mx-auto max-w-xl space-y-16 px-4 py-12">
      {cards.map((card) => (
        <article key={card.kind} className="space-y-6" data-testid={`page-card-${card.kind}`}>
          <CardFrame model={card.model} label={t(`label.${card.kind}`, { names: card.model.names })} />
          <div className="flex flex-wrap justify-center gap-3">
            {card.kind === "invitation" && formAnchor && (
              <a href={`#${formAnchor}`} className="site-button">
                <MessageSquareReply className="size-4" aria-hidden />
                {t("toForm")}
              </a>
            )}
            {card.icsUrl && (
              <a href={card.icsUrl} className="site-button" download>
                <CalendarPlus className="size-4" aria-hidden />
                {t("calendar")}
              </a>
            )}
            {card.websiteUrl && (
              <a href={card.websiteUrl} className="site-button">
                <ExternalLink className="size-4" aria-hidden />
                {t("website")}
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
