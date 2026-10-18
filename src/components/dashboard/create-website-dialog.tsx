"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createWebsiteAction } from "@/app/actions/websites";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ThemeOption = { id: string; name: string; preview: string };

export function CreateWebsiteDialog({
  open,
  onOpenChange,
  themes,
  appUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themes: ThemeOption[];
  appUrl: string;
}) {
  const t = useTranslations("dashboard.createDialog");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(createWebsiteAction, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{t("title")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="create-title">{t("titleLabel")}</Label>
            <Input id="create-title" name="title" required placeholder={t("titlePlaceholder")} />
            <FieldError code={errors.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-date">{t("dateLabel")}</Label>
            <Input id="create-date" name="weddingDate" type="date" />
            <FieldError code={errors.weddingDate} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-slug">{t("slugLabel")}</Label>
            <div className="flex items-center rounded-lg border border-input focus-within:ring-3 focus-within:ring-ring/50">
              <span className="pl-3 text-sm whitespace-nowrap text-muted-foreground">{appUrl.replace(/^https?:\/\//, "")}/</span>
              <Input id="create-slug" name="slug" className="border-0 pl-0.5 focus-visible:ring-0" aria-describedby="create-slug-hint" />
            </div>
            <p id="create-slug-hint" className="text-xs text-muted-foreground">
              {t("slugHint")}
            </p>
            <FieldError code={errors.slug} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("themeLabel")}</legend>
            <div className="grid grid-cols-2 gap-3">
              {themes.map((theme, i) => (
                <label key={theme.id} className="group cursor-pointer">
                  <input type="radio" name="themeId" value={theme.id} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="block overflow-hidden rounded-lg border-2 border-transparent ring-1 ring-border peer-checked:border-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={theme.preview} alt="" className="aspect-[32/22] w-full" />
                  </span>
                  <span className="mt-1 block text-sm">{theme.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {state && !state.ok && state.error && <p role="alert" className="text-sm text-destructive">{tErrors(state.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
