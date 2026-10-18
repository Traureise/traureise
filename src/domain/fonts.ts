export type FontFace = { family: string; fallback: "serif" | "sans-serif" | "cursive" };
export type FontPairing = { id: string; heading: FontFace; body: FontFace };

/** Font pairings for wedding websites. Every family is self-hosted (see src/app/site-fonts.css), all SIL OFL. */
export const FONT_PAIRINGS: readonly FontPairing[] = [
  { id: "klassisch", heading: { family: "Cormorant Garamond", fallback: "serif" }, body: { family: "Source Sans 3", fallback: "sans-serif" } },
  { id: "romantisch", heading: { family: "Great Vibes", fallback: "cursive" }, body: { family: "Lora", fallback: "serif" } },
  { id: "modern", heading: { family: "Josefin Sans", fallback: "sans-serif" }, body: { family: "Work Sans", fallback: "sans-serif" } },
  { id: "elegant", heading: { family: "Playfair Display", fallback: "serif" }, body: { family: "Nunito Sans", fallback: "sans-serif" } },
  { id: "verspielt", heading: { family: "Parisienne", fallback: "cursive" }, body: { family: "Raleway", fallback: "sans-serif" } },
  { id: "markant", heading: { family: "DM Serif Display", fallback: "serif" }, body: { family: "DM Sans", fallback: "sans-serif" } },
  { id: "buchsatz", heading: { family: "Lora", fallback: "serif" }, body: { family: "Source Sans 3", fallback: "sans-serif" } },
  { id: "schlicht", heading: { family: "Raleway", fallback: "sans-serif" }, body: { family: "Lora", fallback: "serif" } },
];

export function findFontPairing(id: string | null | undefined): FontPairing | undefined {
  return FONT_PAIRINGS.find((p) => p.id === id);
}

export function cssFontStack(face: FontFace): string {
  return `"${face.family}", ${face.fallback}`;
}
