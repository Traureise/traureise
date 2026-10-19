"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { saveCardAction } from "@/app/actions/cards";
import type { CardEditor as CardEditorData } from "@/application/cards";
import { CardFrame } from "@/components/cards/card-frame";
import { ImageField } from "@/components/editor/image-field";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { buildCardModel, CARD_FIELDS, type CardContent } from "@/domain/cards";
import { FONT_PAIRINGS } from "@/domain/fonts";
import type { FieldErrors } from "@/domain/result";
import { localize, resolveDesign } from "@/domain/theme";
import { uploadUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

const parseDays = (value: string) =>
  value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);

/**
 * The card editor: theme, palette, layout, photo and texts on the left; on the right the card as guests see
 * it, built in the browser from the same rules and component as the page, the email and the exports.
 */
export function CardEditor({ data, locale, header }: { data: CardEditorData; locale: string; header: React.ReactNode }) {
  const t = useTranslations("cardEditor");
  const tErrors = useTranslations("errors");
  const { card, website } = data;
  const fields: readonly (keyof CardContent)[] = CARD_FIELDS[card.kind];
  const [themeId, setThemeId] = useState(card.themeId);
  const [paletteId, setPaletteId] = useState(card.paletteId);
  const [fontPairingId, setFontPairingId] = useState(card.fontPairingId);
  const [layoutId, setLayoutId] = useState(card.layoutId);
  const [photoKey, setPhotoKey] = useState(card.photoKey);
  const [envelope, setEnvelope] = useState(card.envelope);
  const [content, setContent] = useState<CardContent>(card.content);
  const [message, setMessage] = useState(card.message ?? "");
  const [reminders, setReminders] = useState(card.reminderDays.join(", "));
  const [reminderMessage, setReminderMessage] = useState(card.reminderMessage ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();

  const option = data.themes.find((o) => o.id === themeId) ?? data.themes[0]!;
  const layout = option.layouts.find((l) => l.id === layoutId) ?? option.layouts[0]!;
  const set = <K extends keyof CardContent>(key: K, value: CardContent[K]) => setContent((c) => ({ ...c, [key]: value }));

  const model = useMemo(() => {
    const event = data.events.find((e) => e.id === content.eventId) ?? null;
    return buildCardModel({
      kind: card.kind,
      content,
      design: { ...resolveDesign(option.theme, paletteId, fontPairingId), layout },
      website: { title: website.title, weddingDate: website.weddingDate, location: website.location, url: data.websiteUrl },
      event,
      replyBy: data.replyBy,
      household: card.kind === "thankYou" ? { name: "", personalLine: t("samplePersonalLine") } : null,
      labels: data.labels,
      assets: {
        photoSrc: photoKey ? uploadUrl(photoKey) : null,
        maskSvg: layout.photoMask ? (option.svgs[layout.photoMask] ?? null) : null,
        ornamentSvg: layout.ornament ? (option.svgs[layout.ornament] ?? null) : null,
      },
    });
  }, [card.kind, content, data, fontPairingId, layout, option, paletteId, photoKey, t, website]);

  function pickTheme(id: string) {
    setThemeId(id);
    setPaletteId(null);
    setLayoutId(null);
  }

  function save() {
    start(async () => {
      const result = await saveCardAction(website.id, card.kind, {
        themeId: option.id,
        paletteId,
        fontPairingId,
        layoutId: layout.id,
        envelope,
        photoKey,
        content,
        message,
        reminderDays: parseDays(reminders),
        reminderMessage,
      });
      if (result.ok) {
        setErrors({});
        toast.success(t("saved"));
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(tErrors(result.error ?? (result.fieldErrors ? "invalid_input" : "unknown")));
      }
    });
  }

  const text = (key: "heading" | "names" | "place" | "time" | "venue", placeholder?: string) => (
    <div className="space-y-2" key={key}>
      <Label htmlFor={`card-${key}`}>{t(`fields.${key}`)}</Label>
      <Input id={`card-${key}`} value={content[key]} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} />
      <FieldError code={errors[`content.${key}`]} />
    </div>
  );

  return (
    <div className="grid min-h-dvh lg:h-dvh lg:grid-cols-[440px_1fr]">
      <aside className="space-y-8 border-border bg-card p-6 lg:overflow-y-auto lg:border-r" aria-label={t("formLabel")}>
        {header}
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-medium">{t("design")}</h2>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("theme")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {data.themes.map((o) => (
                <label key={o.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm", o.id === option.id ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                  <input type="radio" name="card-theme" className="sr-only" checked={o.id === option.id} onChange={() => pickTheme(o.id)} />
                  {localize(o.theme.name, locale)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("palette")}</legend>
            <div className="flex flex-wrap gap-2">
              {option.theme.palettes.map((p, i) => {
                const checked = (paletteId ?? option.theme.palettes[0]!.id) === p.id || (!option.theme.palettes.some((x) => x.id === paletteId) && i === 0);
                return (
                  <label key={p.id} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm", checked ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                    <input type="radio" name="card-palette" className="sr-only" checked={checked} onChange={() => setPaletteId(p.id)} />
                    <span className="flex" aria-hidden>
                      {[p.colors.background, p.colors.primary, p.colors.accent].map((c) => (
                        <span key={c} className="-ml-1 size-4 rounded-full border border-black/10 first:ml-0" style={{ background: c }} />
                      ))}
                    </span>
                    {localize(p.name, locale)}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("layout")}</legend>
            <div className="grid grid-cols-2 gap-2">
              {option.layouts.map((l) => (
                <label key={l.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm", l.id === layout.id ? "border-primary ring-2 ring-primary/30" : "border-border")}>
                  <input type="radio" name="card-layout" className="sr-only" checked={l.id === layout.id} onChange={() => setLayoutId(l.id)} />
                  {localize(l.name, locale)}
                </label>
              ))}
            </div>
            <FieldError code={errors.layoutId ?? errors.themeId} />
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="card-fonts">{t("fonts")}</Label>
            <select id="card-fonts" value={fontPairingId ?? ""} onChange={(e) => setFontPairingId(e.target.value || null)} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm">
              <option value="">{t("fontsDefault")}</option>
              {FONT_PAIRINGS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.heading.family} · {p.body.family}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-heading text-xl font-medium">{t("content")}</h2>
          {layout.photo !== "none" && <ImageField websiteId={website.id} label={t("photo")} value={photoKey} onChange={setPhotoKey} error={errors.photoKey} />}
          {fields.includes("heading") && text("heading")}
          {fields.includes("names") && text("names")}
          {fields.includes("place") && text("place")}
          {fields.includes("eventId") && (
            <div className="space-y-2">
              <Label htmlFor="card-event">{t("fields.eventId")}</Label>
              <select id="card-event" value={content.eventId ?? ""} onChange={(e) => set("eventId", e.target.value || null)} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm">
                <option value="">{t("noEvent")}</option>
                {data.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <FieldError code={errors["content.eventId"]} />
            </div>
          )}
          {fields.includes("time") && text("time", t("fromSchedule"))}
          {fields.includes("venue") && text("venue", t("fromSchedule"))}
          <div className="space-y-2">
            <Label htmlFor="card-text">{t("fields.text")}</Label>
            <Textarea id="card-text" rows={4} value={content.text} onChange={(e) => set("text", e.target.value)} />
            <FieldError code={errors["content.text"]} />
          </div>
          {fields.includes("showReplyBy") && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={content.showReplyBy} onChange={(e) => set("showReplyBy", e.target.checked)} className="size-4 accent-primary" />
              {data.replyBy ? t("showReplyBy") : t("showReplyByUnset")}
            </label>
          )}
          {fields.includes("showWebsiteLink") && data.websiteUrl && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={content.showWebsiteLink} onChange={(e) => set("showWebsiteLink", e.target.checked)} className="size-4 accent-primary" />
              {t("showWebsiteLink")}
            </label>
          )}
          {card.kind === "thankYou" && <p className="text-sm text-muted-foreground">{t("personalLineHint")}</p>}
        </section>

        <section className="space-y-4">
          <h2 className="font-heading text-xl font-medium">{t("sending")}</h2>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <Label htmlFor="card-envelope">{t("envelope")}</Label>
            <Switch id="card-envelope" checked={envelope} onCheckedChange={setEnvelope} />
          </div>
          {card.kind !== "engagement" && (
            <div className="space-y-2">
              <Label htmlFor="card-message">{t("message")}</Label>
              <Textarea id="card-message" rows={4} value={message} placeholder={data.defaultMessage} onChange={(e) => setMessage(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("messageHint")}</p>
              <FieldError code={errors.message} />
            </div>
          )}
          {card.kind === "invitation" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="card-reminders">{t("reminderDays")}</Label>
                <Input id="card-reminders" value={reminders} inputMode="numeric" placeholder="14, 3" onChange={(e) => setReminders(e.target.value)} aria-describedby="card-reminders-hint" />
                <p id="card-reminders-hint" className="text-xs text-muted-foreground">
                  {t("reminderDaysHint")}
                </p>
                <FieldError code={errors.reminderDays ?? Object.entries(errors).find(([k]) => k.startsWith("reminderDays."))?.[1]} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-reminder-message">{t("reminderMessage")}</Label>
                <Textarea id="card-reminder-message" rows={3} value={reminderMessage} placeholder={data.defaultReminderMessage} onChange={(e) => setReminderMessage(e.target.value)} />
                <FieldError code={errors.reminderMessage} />
              </div>
            </>
          )}
        </section>

        <Button type="button" className="w-full" disabled={pending} onClick={save}>
          {pending ? t("saving") : t("save")}
        </Button>
      </aside>
      <section aria-label={t("preview")} className="flex min-h-[70vh] flex-col bg-muted lg:min-h-0">
        <div className="border-b border-border bg-background px-4 py-2 text-sm text-muted-foreground">{t("preview")}</div>
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-6 sm:p-10" data-testid="card-preview">
          <CardFrame model={model} className="w-full max-w-md" />
        </div>
      </section>
    </div>
  );
}
