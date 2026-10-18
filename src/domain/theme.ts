import { z } from "zod";
import { FONT_PAIRINGS, findFontPairing, type FontPairing } from "./fonts";
import { parseWith, type Parsed } from "./result";

const localized = z.object({ de: z.string().min(1) }).catchall(z.string().min(1));
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "invalid_color");
const assetFile = z.string().regex(/^[a-z0-9][a-z0-9-]*\.(svg|png|jpg|webp)$/, "invalid_asset");

export const themeManifestSchema = z.object({
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
});

export type ThemeManifest = z.infer<typeof themeManifestSchema>;
export type Palette = ThemeManifest["palettes"][number];
export type LocalizedText = ThemeManifest["name"];

export function parseThemeManifest(input: unknown, folderName: string): Parsed<ThemeManifest> {
  const result = parseWith(themeManifestSchema, input);
  if (result.ok && result.value.id !== folderName) return { ok: false, fieldErrors: { id: "folder_mismatch" } };
  return result;
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
