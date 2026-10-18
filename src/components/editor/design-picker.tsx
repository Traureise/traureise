"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateDesignAction } from "@/app/actions/editor";
import type { FontPairing } from "@/domain/fonts";
import { cssFontStack } from "@/domain/fonts";
import { cn } from "@/lib/utils";
import { useSave } from "./use-save";

export type PaletteOption = { id: string; name: string; colors: string[] };

export function DesignPicker({
  websiteId,
  palettes,
  fonts,
  paletteId,
  fontPairingId,
  defaultFontPairingId,
}: {
  websiteId: string;
  palettes: PaletteOption[];
  fonts: readonly FontPairing[];
  paletteId: string;
  fontPairingId: string;
  defaultFontPairingId: string;
}) {
  const t = useTranslations("editor.design");
  const { pending, save } = useSave();
  // Selection updates at once; the preview follows when the save completes.
  const [selected, setSelected] = useState({ paletteId, fontPairingId });
  const update = (patch: { paletteId?: string; fontPairingId?: string }) => {
    const next = { ...selected, ...patch };
    setSelected(next);
    save(() => updateDesignAction(websiteId, next));
  };

  return (
    <div className="space-y-8">
      <fieldset className="space-y-3" disabled={pending}>
        <legend className="mb-3 text-sm font-medium">{t("palette")}</legend>
        <div className="grid gap-2">
          {palettes.map((p) => (
            <label
              key={p.id}
              className={cn("flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3", p.id === selected.paletteId ? "border-primary" : "border-border")}
            >
              <input type="radio" name="palette" value={p.id} checked={p.id === selected.paletteId} onChange={() => update({ paletteId: p.id })} className="sr-only" />
              <span className="flex" aria-hidden>
                {p.colors.map((color, i) => (
                  <span key={i} className="-ml-1.5 size-7 rounded-full border-2 border-card first:ml-0" style={{ background: color }} />
                ))}
              </span>
              <span className="font-medium">{p.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={pending}>
        <legend className="mb-3 text-sm font-medium">{t("fonts")}</legend>
        <div className="grid gap-2">
          {fonts.map((pair) => (
            <label
              key={pair.id}
              className={cn("block cursor-pointer rounded-xl border-2 p-4", pair.id === selected.fontPairingId ? "border-primary" : "border-border")}
            >
              <input
                type="radio"
                name="fontPairing"
                value={pair.id}
                checked={pair.id === selected.fontPairingId}
                onChange={() => update({ fontPairingId: pair.id })}
                className="sr-only"
                aria-label={`${pair.heading.family} / ${pair.body.family}`}
              />
              <span className="flex items-center justify-between text-xs text-muted-foreground">
                {t("headings")}
                {pair.id === defaultFontPairingId && <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{t("themeDefault")}</span>}
              </span>
              <span className="block text-2xl" style={{ fontFamily: cssFontStack(pair.heading) }}>
                {pair.heading.family}
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">{t("body")}</span>
              <span className="block" style={{ fontFamily: cssFontStack(pair.body) }}>
                {pair.body.family}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
