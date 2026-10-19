"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import "./letter.css";

type State = "closed" | "opening" | "open";

/** Without JavaScript the envelope cannot open, so the card shows directly. */
const NO_SCRIPT_CSS = ".letter .letter-stage{display:none}.letter[data-state] .letter-content{display:block}";

/**
 * The household's page opens like a letter: a sealed envelope addressed to the household; tapping it opens
 * it and the card slides out. Without JavaScript (see the noscript style), with reduced motion, or when the
 * couple switched the envelope off, the card shows directly.
 *
 * Once the card is shown, the page tells the server which cards were seen (`openedUrl`), which is the
 * "opened" status: the household's own page, first-party, no pixel. Previews pass no URL and record nothing.
 */
export function Letter({ envelope, greeting, openedUrl, kinds, children }: { envelope: boolean; greeting: string | null; openedUrl: string | null; kinds: string[]; children: React.ReactNode }) {
  const t = useTranslations("letter");
  const [state, setState] = useState<State>(envelope ? "closed" : "open");
  const reported = useRef(false);

  useEffect(() => {
    // With reduced motion, CSS skips the envelope, so the card is shown right away.
    const shown = state !== "closed" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!shown || reported.current || !openedUrl || kinds.length === 0) return;
    reported.current = true;
    void fetch(openedUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kinds }), keepalive: true }).catch(() => undefined);
  }, [state, openedUrl, kinds]);

  function open() {
    setState("opening");
    window.setTimeout(() => setState("open"), 1300);
  }

  return (
    <div className="letter relative" data-state={state} data-testid="letter">
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      {state !== "open" && (
        <div className="letter-stage">
          <div>
            <button type="button" className="letter-envelope" onClick={open} disabled={state !== "closed"} aria-label={t("open", { name: greeting ?? t("everyone") })} data-testid="envelope">
              <span className="letter-flap" aria-hidden />
              <span className="letter-seal" aria-hidden />
              <span className="letter-address" aria-hidden>
                {greeting ? t("to", { name: greeting }) : t("toEveryone")}
              </span>
            </button>
            <p className="letter-hint" aria-hidden>
              {t("hint")}
            </p>
          </div>
        </div>
      )}
      <div className="letter-content">{children}</div>
    </div>
  );
}
