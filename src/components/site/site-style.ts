import type { CSSProperties } from "react";
import type { ResolvedDesign } from "@/domain/theme";
import { cssFontStack } from "@/domain/fonts";
import { themeAssetUrl } from "@/lib/format";

/** Theme tokens as CSS custom properties; everything in components/site styles itself from these. */
export function siteStyle({ theme, palette, fonts }: ResolvedDesign): CSSProperties {
  const c = palette.colors;
  const asset = (file?: string) => (file ? `url("${themeAssetUrl(theme.id, file)}")` : "none");
  return {
    "--site-bg": c.background,
    "--site-surface": c.surface,
    "--site-text": c.text,
    "--site-muted": c.muted,
    "--site-primary": c.primary,
    "--site-accent": c.accent,
    "--site-heading": cssFontStack(fonts.heading),
    "--site-body": cssFontStack(fonts.body),
    "--site-frame": asset(theme.assets.heroFrame),
    "--site-divider": asset(theme.assets.divider),
    "--site-background-image": asset(theme.assets.background),
  } as CSSProperties;
}
