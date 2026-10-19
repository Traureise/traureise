import type { CSSProperties } from "react";
import { cardAccent, type CardModel } from "@/domain/cards";
import { cssFontStack } from "@/domain/fonts";

/** The card is 60em wide with the proportions of A-series paper; `fontSize` on the root sets the scale. */
export const CARD_WIDTH_EM = 60;
export const CARD_HEIGHT_EM = 84.85;

const flex = (style: CSSProperties): CSSProperties => ({ display: "flex", ...style });

const PHOTO_SIZE: Record<Exclude<CardModel["layout"]["photo"], "full" | "none">, { width: string; height: string }> = {
  masked: { width: "30em", height: "37.5em" },
  circle: { width: "32em", height: "32em" },
  rect: { width: "46em", height: "31em" },
};

/**
 * One card, drawn from a CardModel. This one component renders the guests' page, the editor's live preview,
 * the dashboard thumbnail, and (through satori) the email image and the PDF/PNG exports, so they cannot drift.
 * Satori understands only a subset of CSS: every box is flex, styles are inline, sizes are in em.
 */
export function CardView({ model, fontSize }: { model: CardModel; fontSize: string | number }) {
  const { layout, colors, fonts } = model;
  const full = layout.photo === "full" && !!model.photoSrc;
  const center = layout.align === "center";
  // Full width so long lines wrap; justifyContent aligns the (flex) text box like textAlign does in a browser.
  const block: CSSProperties = { width: "100%", textAlign: layout.align, justifyContent: center ? "center" : "flex-start" };
  const heading: CSSProperties = { ...block, fontFamily: cssFontStack(fonts.heading), fontWeight: 500, lineHeight: 1.1 };
  const body: CSSProperties = { ...block, fontFamily: cssFontStack(fonts.body), fontWeight: 400, lineHeight: 1.45 };
  const upper = layout.headingCase === "upper";
  const accent = cardAccent(model);
  const hasHeading = !!model.heading;

  const photo =
    model.photoSrc && !full && layout.photo !== "none" ? (
      <div
        style={flex({
          ...PHOTO_SIZE[layout.photo as keyof typeof PHOTO_SIZE],
          flexShrink: 0,
          marginBottom: "3.2em",
          overflow: "hidden",
          borderRadius: layout.photo === "circle" ? "50%" : layout.photo === "rect" ? "0.6em" : 0,
          ...(layout.photo === "masked" && model.maskSrc ? { maskImage: `url(${model.maskSrc})`, maskSize: "100% 100%", maskRepeat: "no-repeat" } : {}),
        })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={model.photoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    ) : null;

  return (
    <div
      data-testid="card-view"
      data-kind={model.kind}
      data-layout={layout.id}
      style={flex({
        position: "relative",
        // Browsers get border-box from Tailwind's preflight; satori defaults to content-box.
        boxSizing: "border-box",
        fontSize,
        lineHeight: 1.45,
        width: `${CARD_WIDTH_EM}em`,
        height: `${CARD_HEIGHT_EM}em`,
        flexDirection: "column",
        alignItems: center ? "center" : "flex-start",
        justifyContent: full ? "flex-end" : "center",
        padding: full ? "6em 6em 7em" : "6em",
        overflow: "hidden",
        backgroundColor: colors.card,
        color: colors.onCard,
      })}
    >
      {full && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={model.photoSrc!} alt="" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={flex({ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0) 35%, rgba(0,0,0,0.72) 100%)" })} />
        </>
      )}
      {layout.border && (
        <div style={flex({ position: "absolute", left: "2.4em", top: "2.4em", right: "2.4em", bottom: "2.4em", border: `0.16em solid ${accent}` })} />
      )}
      {photo}
      <div style={flex({ position: "relative", flexDirection: "column", alignItems: center ? "center" : "flex-start", width: "100%" })}>
        <div style={flex({ ...body, fontSize: "1.7em", letterSpacing: "0.32em", textTransform: "uppercase", color: accent, marginBottom: "1.2em" })}>{model.eyebrow}</div>
        {hasHeading && <div style={flex({ ...heading, fontSize: "3.4em", textTransform: upper ? "uppercase" : "none", marginBottom: "0.35em" })}>{model.heading}</div>}
        <div style={flex({ ...heading, fontSize: hasHeading ? "5em" : "6.4em", textTransform: upper ? "uppercase" : "none" })}>{model.names}</div>
        {model.ornamentSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={model.ornamentSrc} alt="" style={{ width: "22em", height: "3.7em", marginTop: "1.8em", marginBottom: "0.6em" }} />
        )}
        {model.details.length > 0 && (
          <div style={flex({ flexDirection: "column", alignItems: center ? "center" : "flex-start", marginTop: model.ornamentSrc ? "0.8em" : "2em" })}>
            {model.details.map((line, i) => (
              <div key={i} style={flex({ ...body, fontSize: i === 0 ? "2.6em" : "2.1em", letterSpacing: i === 0 ? "0.04em" : 0 })}>
                {line}
              </div>
            ))}
          </div>
        )}
        {model.text && <div style={flex({ ...body, fontSize: "2em", color: colors.onCardMuted, marginTop: "1.6em", whiteSpace: "pre-wrap" })}>{model.text}</div>}
        {model.personalLine && (
          <div data-testid="card-personal-line" style={flex({ ...heading, fontSize: "2.8em", marginTop: "1em" })}>
            {model.personalLine}
          </div>
        )}
        {model.footer && <div style={flex({ ...body, fontSize: "1.6em", letterSpacing: "0.12em", textTransform: "uppercase", color: accent, marginTop: "2.4em" })}>{model.footer}</div>}
      </div>
    </div>
  );
}
