"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { selectThemeAction } from "@/app/actions/editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSave } from "./use-save";

export type ThemeCard = { id: string; name: string; category: string; preview: string };

export function ThemePicker({ websiteId, current, themes }: { websiteId: string; current: string; themes: ThemeCard[] }) {
  const t = useTranslations("editor.theme");
  const { pending, save } = useSave();
  return (
    <ul className="grid gap-4">
      {themes.map((theme) => {
        const selected = theme.id === current;
        return (
          <li key={theme.id} className={cn("overflow-hidden rounded-xl border-2", selected ? "border-primary" : "border-border")} data-testid={`theme-${theme.id}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={theme.preview} alt={t("previewAlt", { name: theme.name })} className="aspect-[32/22] w-full bg-muted" />
            <div className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium">{theme.name}</p>
                <p className="text-xs text-muted-foreground">{theme.category}</p>
              </div>
              {selected ? (
                <span className="inline-flex items-center gap-1 text-sm text-primary">
                  <Check className="size-4" aria-hidden />
                  {t("selected")}
                </span>
              ) : (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => save(() => selectThemeAction(websiteId, theme.id))} aria-label={`${t("choose")}: ${theme.name}`}>
                  {t("choose")}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
