import { z } from "zod";
import { CARD_KINDS, type CardKind } from "./card-kinds";
import { FONT_PAIRINGS, findFontPairing, type FontPairing } from "./fonts";
import { parseWith, type Parsed } from "./result";

const localized = z.object({ de: z.string().min(1) }).catchall(z.string().min(1));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "invalid_color");
const assetFile = z.string().regex(/^[a-z0-9][a-z0-9-]*\.(svg|png|jpg|webp)$/, "invalid_asset");

/**
 * A card layout: how a card of this theme is arranged. Layouts are data, so a theme folder can add new
 * designs without code: the photo's shape (an SVG mask from the theme, a circle, a plain rectangle, the
 * whole card, or no photo), an ornament (SVG, tinted in the palette's accent), alignment, the card's
 * colour and a few type choices.
 */
const cardLayoutSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: localized,
    /** Kinds this layout is offered for; all four if left out. */
    kinds: z.array(z.enum(CARD_KINDS)).min(1).optional(),
    photo: z.enum(["masked", "circle", "rect", "full", "none"]),
    /** Required for "masked": a black-on-transparent SVG whose shape the photo takes. */
    photoMask: assetFile.optional(),
    ornament: assetFile.optional(),
    align: z.enum(["center", "left"]).default("center"),
    surface: z.enum(["background", "surface", "primary"]).default("background"),
    border: z.boolean().default(false),
    headingCase: z.enum(["normal", "upper"]).default("normal"),
  })
  .refine((l) => l.photo !== "masked" || l.photoMask, { message: "mask_required", path: ["photoMask"] });

export type CardLayout = z.infer<typeof cardLayoutSchema>;

export const themeManifestSchema = z.object({
  $schema: z.string().optional(),
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: localized,
  category: localized,
  palettes: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        name: localized,
        colors: z.object({ background: hex, surface: hex, text: hex, muted: hex, primary: hex, accent: hex }),
      }),
    )
    .min(1),
  fonts: z.object({
    defaultPairing: z.string().refine((id) => FONT_PAIRINGS.some((p) => p.id === id), "unknown_font_pairing"),
  }),
  assets: z.object({
    preview: assetFile,
    heroFrame: assetFile.optional(),
    divider: assetFile.optional(),
    background: assetFile.optional(),
  }),
  cards: z
    .object({
      layouts: z.array(cardLayoutSchema).refine((list) => new Set(list.map((l) => l.id)).size === list.length, "duplicate_layout"),
    })
    .optional(),
});

export type ThemeManifest = z.infer<typeof themeManifestSchema>;
export type Palette = ThemeManifest["palettes"][number];
export type LocalizedText = ThemeManifest["name"];

export function parseThemeManifest(input: unknown, folderName: string): Parsed<ThemeManifest> {
  const result = parseWith(themeManifestSchema, input);
  if (result.ok && result.value.id !== folderName) return { ok: false, fieldErrors: { id: "folder_mismatch" } };
  return result;
}

/** Layouts a theme offers for one kind of card, in manifest order. */
export function cardLayoutsFor(theme: ThemeManifest, kind: CardKind): CardLayout[] {
  return (theme.cards?.layouts ?? []).filter((l) => !l.kinds || l.kinds.includes(kind));
}

/** Every file a manifest refers to: the loader checks they exist, and only these are served. */
export function themeAssetFiles(theme: ThemeManifest): string[] {
  const files = new Set(Object.values(theme.assets).filter((f): f is string => !!f));
  for (const layout of theme.cards?.layouts ?? []) {
    if (layout.photoMask) files.add(layout.photoMask);
    if (layout.ornament) files.add(layout.ornament);
  }
  return [...files];
}

export function localize(text: LocalizedText, locale: string): string {
  return text[locale] ?? text.de;
}

export type ResolvedDesign = { theme: ThemeManifest; palette: Palette; fonts: FontPairing };

/** The effective look of a website: chosen palette/fonts if still valid, otherwise the theme defaults. */
export function resolveDesign(theme: ThemeManifest, paletteId: string | null, fontPairingId: string | null): ResolvedDesign {
  const palette = theme.palettes.find((p) => p.id === paletteId) ?? theme.palettes[0]!;
  const fonts = findFontPairing(fontPairingId) ?? findFontPairing(theme.fonts.defaultPairing)!;
  return { theme, palette, fonts };
}
