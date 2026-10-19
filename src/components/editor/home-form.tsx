"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveHomeAction, setCoverImageAction } from "@/app/actions/editor";
import type { Website } from "@/application/ports";
import { FieldError } from "@/components/forms/field-error";
import { SlugChangeHint } from "@/components/forms/slug-change-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "./image-field";
import { useSave } from "./use-save";

/** The home section of one website version. Names, date, place and time zone are the wedding's (details dialog). */
export function HomeForm({ website, appUrl, details }: { website: Website; appUrl: string; details: React.ReactNode }) {
  const t = useTranslations("editor");
  const tErrors = useTranslations("errors");
  const { pending, errors, save } = useSave();
  const [countdown, setCountdown] = useState(website.showCountdown);
  const [slug, setSlug] = useState(website.slug);
  const [, startCover] = useTransition();

  function setCover(key: string | null) {
    startCover(async () => {
      const result = await setCoverImageAction(website.id, key);
      if (result.ok) toast.success(t("saved"));
      else toast.error(tErrors(result.fieldErrors?.coverImageKey ?? result.error ?? "unknown"));
    });
  }

  function submit(form: FormData) {
    const value = (key: string) => String(form.get(key) ?? "");
    save(() => saveHomeAction(website.id, { welcomeMessage: value("welcomeMessage"), hashtag: value("hashtag"), showCountdown: countdown, slug: value("slug") }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-2 rounded-lg bg-secondary/40 p-3 text-sm text-muted-foreground" data-testid="home-wedding-details">
        {t("home.wedding")}
        {details}
      </div>
      <ImageField weddingId={website.weddingId} label={t("home.cover")} value={website.coverImageKey} onChange={setCover} />
      <form onSubmit={(e) => (e.preventDefault(), submit(new FormData(e.currentTarget)))} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="welcomeMessage">{t("home.welcomeLabel")}</Label>
          <Textarea id="welcomeMessage" name="welcomeMessage" rows={5} defaultValue={website.welcomeMessage} />
          <FieldError code={errors.welcomeMessage} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="hashtag">{t("home.hashtagLabel")}</Label>
          <Input id="hashtag" name="hashtag" defaultValue={website.hashtag ? `#${website.hashtag}` : ""} />
          <FieldError code={errors.hashtag} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <Label htmlFor="showCountdown">{t("home.countdownLabel")}</Label>
          <Switch id="showCountdown" checked={countdown} onCheckedChange={setCountdown} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">{t("home.slugLabel")}</Label>
          <div className="flex min-w-0 items-center rounded-lg border border-input focus-within:ring-3 focus-within:ring-ring/50">
            <span className="truncate pl-3 text-sm whitespace-nowrap text-muted-foreground">{appUrl.replace(/^https?:\/\//, "")}/</span>
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="min-w-0 border-0 pl-0.5 focus-visible:ring-0"
              aria-describedby="slug-hint slug-change"
            />
          </div>
          <p id="slug-hint" className="text-xs text-muted-foreground">
            {t("home.slugHint")}
          </p>
          <SlugChangeHint id="slug-change" saved={website.slug} value={slug} message={t("home.slugChangeHint")} />
          <FieldError code={errors.slug} />
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("saving") : t("save")}
        </Button>
      </form>
    </div>
  );
}
