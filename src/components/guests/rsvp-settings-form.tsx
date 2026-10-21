"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, BellOff, CalendarClock, Check, Mail, MessageCircle, Newspaper, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { saveRsvpSettingsAction } from "@/app/actions/guests";
import { useSave } from "@/components/editor/use-save";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/forms/date-field";
import { MessageField } from "@/components/forms/message-field";
import { SettingsSection } from "@/components/app/settings-section";
import { NOTIFY_MODES, WHATSAPP_MESSAGE_MAX, type NotifyMode, type RsvpSettings } from "@/domain/guests";

type Option = { key: string; id: string | null; label: string };
let counter = 0;
export const blankOption = (): Option => ({ key: `new-${++counter}`, id: null, label: "" });

/** Editable list of answer options (dishes, poll answers). Ids stay with their option across edits. */
export function OptionList({ options, onChange, label, addLabel, removeLabel }: { options: Option[]; onChange: (o: Option[]) => void; label: (n: number) => string; addLabel: string; removeLabel: (n: number) => string }) {
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={o.key} className="flex items-center gap-2">
            <Input aria-label={label(i + 1)} value={o.label} onChange={(e) => onChange(options.map((x) => (x.key === o.key ? { ...x, label: e.target.value } : x)))} />
            <Button type="button" variant="ghost" size="icon" aria-label={removeLabel(i + 1)} onClick={() => onChange(options.filter((x) => x.key !== o.key))}>
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...options, blankOption()])}>
        <Plus aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}

const NOTIFY_ICONS: Record<NotifyMode, typeof Bell> = { off: BellOff, each: Mail, daily: Newspaper };

export const toOptions = (options: { id: string; label: string }[]): Option[] => options.map((o) => ({ key: o.id, id: o.id, label: o.label }));

export function RsvpSettingsForm({
  weddingId,
  settings,
  schedule,
  whatsappDefault,
  notificationsLocked,
}: {
  weddingId: string;
  settings: RsvpSettings;
  schedule: { id: string; name: string }[];
  whatsappDefault: string;
  notificationsLocked: boolean;
}) {
  const t = useTranslations("guests.settings");
  const router = useRouter();
  const { pending, errors, save } = useSave();
  const [replyBy, setReplyBy] = useState(settings.replyBy ?? "");
  const [eventIds, setEventIds] = useState<string[]>(settings.eventIds ?? schedule.map((e) => e.id));
  const [mealOptions, setMealOptions] = useState<Option[]>(settings.meal ? toOptions(settings.meal.options) : []);
  const [mealEvent, setMealEvent] = useState(settings.meal?.eventId ?? "");
  const [notify, setNotify] = useState<NotifyMode>(settings.notify);
  const [whatsapp, setWhatsapp] = useState(settings.whatsappMessage ?? "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    save(
      () =>
        saveRsvpSettingsAction(weddingId, {
          replyBy,
          eventIds: schedule.every((e) => eventIds.includes(e.id)) ? null : eventIds,
          meal: { eventId: mealEvent, options: mealOptions.map(({ id, label }) => ({ id, label })) },
          notify,
          whatsappMessage: whatsapp,
        }),
      () => router.refresh(),
    );
  }

  const previewText = (whatsapp.trim() || whatsappDefault).replaceAll("{name}", t("preview.household"));

  return (
    <form onSubmit={submit} aria-label={t("title")}>
      <SettingsSection id="rsvp-answers" icon={<CalendarClock />} title={t("sections.answers.title")} description={t("sections.answers.lead")}>
        <DateField id="rsvp-reply-by" label={t("replyBy")} value={replyBy} onChange={setReplyBy} hint={t("replyByHint")} error={errors.replyBy} />
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("events")}</legend>
          {schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSchedule")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {schedule.map((e) => (
                <label
                  key={e.id}
                  className="relative inline-flex cursor-pointer items-center gap-2 rounded-full border border-input bg-card px-3.5 py-1.5 text-sm transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <input
                    type="checkbox"
                    className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
                    checked={eventIds.includes(e.id)}
                    onChange={(ev) => setEventIds((list) => (ev.target.checked ? [...list, e.id] : list.filter((id) => id !== e.id)))}
                  />
                  <Check className="hidden size-3.5 peer-checked:block" aria-hidden />
                  {e.name}
                </label>
              ))}
            </div>
          )}
          <FieldError code={errors.eventIds} />
        </fieldset>
      </SettingsSection>

      <SettingsSection id="rsvp-meal" icon={<UtensilsCrossed />} title={t("sections.meal.title")} description={t("sections.meal.lead")}>
        <fieldset className="space-y-3">
          <legend className="sr-only">{t("meal")}</legend>
          {mealOptions.length === 0 && <p className="rounded-xl border border-dashed border-input px-4 py-3 text-sm text-muted-foreground">{t("mealEmpty")}</p>}
          <OptionList options={mealOptions} onChange={setMealOptions} label={(n) => t("dish", { n })} addLabel={t("addDish")} removeLabel={(n) => t("removeDish", { n })} />
        </fieldset>
        {schedule.length > 0 && mealOptions.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="rsvp-meal-event">{t("mealEvent")}</Label>
            <select id="rsvp-meal-event" value={mealEvent} onChange={(e) => setMealEvent(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm">
              <option value="">{t("mealEveryEvent")}</option>
              {schedule.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <FieldError code={errors["meal.eventId"]} />
          </div>
        )}
      </SettingsSection>

      <SettingsSection id="rsvp-notify" icon={<Bell />} title={t("sections.notify.title")} description={t("sections.notify.lead")}>
        <fieldset className="space-y-3">
          <legend className="sr-only">{t("notify")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {NOTIFY_MODES.map((mode) => {
              const Icon = NOTIFY_ICONS[mode];
              return (
                <label
                  key={mode}
                  className="relative flex cursor-pointer flex-col gap-2 rounded-xl border border-input bg-card p-4 text-sm transition-colors has-checked:border-primary has-checked:bg-secondary/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <input type="radio" name="notify" value={mode} checked={notify === mode} onChange={() => setNotify(mode)} className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-xl opacity-0" />
                  <Icon className="size-5 text-muted-foreground peer-checked:text-primary" aria-hidden />
                  <span className="font-medium">{t(`notifyModes.${mode}`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`notifyHints.${mode}`)}</span>
                  <Check className="absolute top-3 right-3 hidden size-4 text-primary peer-checked:block" aria-hidden />
                </label>
              );
            })}
          </div>
          {notificationsLocked && <p className="text-xs text-muted-foreground">{t("notifyLocked")}</p>}
        </fieldset>
      </SettingsSection>

      <SettingsSection id="rsvp-whatsapp-section" icon={<MessageCircle />} title={t("sections.whatsapp.title")} description={t("sections.whatsapp.lead")}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
          <MessageField id="rsvp-whatsapp" label={t("whatsapp")} value={whatsapp} onChange={setWhatsapp} defaultText={whatsappDefault} max={WHATSAPP_MESSAGE_MAX} hint={t("whatsappHint")} rows={5} error={errors.whatsappMessage} />
          <figure className="space-y-2" aria-label={t("preview.label")}>
            <figcaption className="text-sm font-medium">{t("preview.label")}</figcaption>
            <div className="rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-background))] p-4">
              <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm bg-card px-3.5 py-2.5 text-sm shadow-[0_1px_0_var(--color-border)]" data-testid="whatsapp-preview">
                <p className="whitespace-pre-line">{previewText}</p>
                <p className="mt-1 break-all text-primary underline underline-offset-2">{t("preview.link")}</p>
              </div>
            </div>
          </figure>
        </div>
      </SettingsSection>

      <div className="sticky bottom-0 z-10 -mx-6 flex items-center justify-end gap-3 rounded-b-3xl border-t border-border bg-card/90 px-6 py-3 backdrop-blur sm:-mx-10 sm:px-10">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
