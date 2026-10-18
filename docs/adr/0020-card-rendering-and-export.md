---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Card rendering and export inside the app

## Context and Problem Statement

A card appears on the household's page, in the editor's live preview, on the dashboard, as the image in
emails, and as PDF (A6, A5) and PNG for printing at home. These must not drift apart. The export must run
inside the app container, without a browser service or an external API, and the Docker image must still
build on the CI runner and on a 2 GB machine. Card designs come from theme folders.

## Considered Options

* A headless browser (Chromium via Playwright or Puppeteer) printing the card page
* An external rendering API
* One React component in a CSS subset that satori turns into SVG; sharp rasterises it; pdf-lib wraps the PNG

## Decision Outcome

Chosen option: "One React component, satori, sharp and pdf-lib".

* `CardView` draws a card from a `CardModel` (built by `buildCardModel` in `src/domain/cards.ts`). The
  browser renders it as HTML (page, editor preview, dashboard); `SatoriCardRenderer` renders the same
  component with satori to SVG (text as paths), sharp (already used for uploads) to PNG, and pdf-lib to a
  one-page PDF with the PNG at 300 dpi. The component uses only what satori supports: flex boxes, inline
  styles, sizes in `em` (so CSS container units scale it in the browser), `border-box`.
* Fonts are the same `@fontsource` files the browser loads, WOFF (satori cannot read WOFF2), latin and
  latin-ext, exactly the weights in `site-fonts.css` (a unit test compares them). Images are data URIs, so
  satori never fetches anything. Photos are converted to JPEG for the renderer.
* Layouts are data in `theme.json` (`cards.layouts`): the photo's shape (an SVG mask from the theme, circle,
  rectangle, full bleed or none), an ornament tinted in the accent colour, alignment, card colour, border,
  heading case. A new design is a new theme folder.
* satori, sharp and pdf-lib are server-external packages; Next.js file tracing includes the font files.
  Rendering a card takes about 0.1–0.7 s and a few tens of MB; the image grows by a few MB.
* Export is gated through `canUse`: designing and previews are free.

### Consequences

* Good, because page, preview, email image and exports come from one component and cannot drift.
* Good, because there is no browser in the image: small, quick to build, no extra memory.
* Bad, because the card component is limited to satori's CSS subset (no grid, no italic synthesis, no
  emoji without an emoji font: emoji are left out of exports).
* Bad, because the PDF holds a 300 dpi image, not vector text; that is plenty for printing at home.
