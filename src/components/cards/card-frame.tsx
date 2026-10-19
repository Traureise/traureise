import type { CardModel } from "@/domain/cards";
import { CardView } from "./card-view";

/**
 * A card that fills the width it gets: the frame is a size container and the card's em scale is 1/60 of
 * its width, so it scales with CSS alone (no JavaScript, also in the editor's live preview).
 */
export function CardFrame({ model, className, label }: { model: CardModel; className?: string; label?: string }) {
  return (
    <figure className={className} style={{ containerType: "inline-size" }} aria-label={label}>
      <div style={{ boxShadow: "0 18px 40px -18px rgb(0 0 0 / 0.35)", lineHeight: 0 }}>
        <CardView model={model} fontSize="calc(100cqw / 60)" />
      </div>
    </figure>
  );
}
