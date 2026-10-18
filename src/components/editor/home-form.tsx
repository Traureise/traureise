"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveHomeAction, setCoverImageAction } from "@/app/actions/editor";
import type { Website } from "@/application/ports";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "./image-field";
import { useSave } from "./use-save";

export function HomeForm({ website, appUrl, timeZones }: { website: Website; appUrl: string; timeZones: string[] }) {
  const t = useTranslations("editor");
  const tErrors = useTranslations("errors");
  const { pending, errors, save } = useSave();
  const [dateOpen, setDateOpen] = useState(!website.weddingDate);
  const [locationOpen, setLocationOpen] = useState(!website.location);
  const [countdown, setCountdown] = useState(website.showCountdown);
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
    save(() =>
      saveHomeAction(website.id, {
        title: value("title"),
        weddingDate: dateOpen ? "" : value("weddingDate"),
        location: locationOpen ? "" : value("location"),
        welcomeMessage: value("welcomeMessage"),
        hashtag: value("hashtag"),
        showCountdown: countdown,
        timezone: value("timezone"),
        slug: value("slug"),
      }),
    );
  }

  return (
    <div className="space-y-6">
      <ImageField websiteId={website.id} label={t("home.cover")} value={website.coverImageKey} onChange={setCover} />
      <form onSubmit={(e) => (e.preventDefault(), submit(new FormData(e.currentTarget)))} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">{t("home.titleLabel")}</Label>
          <Input id="title" name="title" defaultValue={website.title} />
          <FieldError code={errors.title} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="weddingDate">{t("home.dateLabel")}</Label>
          <Input id="weddingDate" name="weddingDate" type="date" defaultValue={website.weddingDate ?? ""} disabled={dateOpen} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dateOpen} onChange={(e) => setDateOpen(e.target.checked)} className="size-4 accent-primary" />
            {t("home.dateOpen")}
          </label>
          <FieldError code={errors.weddingDate} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">{t("home.locationLabel")}</Label>
          <Input id="location" name="location" defaultValue={website.location ?? ""} disabled={locationOpen} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={locationOpen} onChange={(e) => setLocationOpen(e.target.checked)} className="size-4 accent-primary" />
            {t("home.locationOpen")}
          </label>
          <FieldError code={errors.location} />
        </div>

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
          <Label htmlFor="timezone">{t("home.timezoneLabel")}</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={website.timezone}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <FieldError code={errors.timezone} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">{t("home.slugLabel")}</Label>
          <div className="flex items-center rounded-lg border border-input focus-within:ring-3 focus-within:ring-ring/50">
            <span className="pl-3 text-sm whitespace-nowrap text-muted-foreground">{appUrl.replace(/^https?:\/\//, "")}/</span>
            <Input id="slug" name="slug" defaultValue={website.slug} className="border-0 pl-0.5 focus-visible:ring-0" aria-describedby="slug-hint" />
          </div>
          <p id="slug-hint" className="text-xs text-muted-foreground">
            {t("home.slugHint")}
          </p>
          <FieldError code={errors.slug} />
        </div>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? t("saving") : t("save")}
        </Button>
      </form>
    </div>
  );
}
