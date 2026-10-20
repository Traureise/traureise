"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
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

  return (
    <form onSubmit={submit} aria-label={t("title")}>
      <SettingsSection id="rsvp-answers" title={t("sections.answers.title")} description={t("sections.answers.lead")}>
        <DateField id="rsvp-reply-by" label={t("replyBy")} value={replyBy} onChange={setReplyBy} hint={t("replyByHint")} error={errors.replyBy} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("events")}</legend>
          {schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSchedule")}</p>
          ) : (
            schedule.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={eventIds.includes(e.id)}
                  onChange={(ev) => setEventIds((list) => (ev.target.checked ? [...list, e.id] : list.filter((id) => id !== e.id)))}
                />
                {e.name}
              </label>
            ))
          )}
          <FieldError code={errors.eventIds} />
        </fieldset>
      </SettingsSection>

      <SettingsSection id="rsvp-meal" title={t("sections.meal.title")} description={t("sections.meal.lead")}>
        <fieldset className="space-y-3">
          <legend className="sr-only">{t("meal")}</legend>
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

      <SettingsSection id="rsvp-notify" title={t("sections.notify.title")} description={t("sections.notify.lead")}>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("notify")}</legend>
          {NOTIFY_MODES.map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-sm">
              <input type="radio" name="notify" value={mode} checked={notify === mode} onChange={() => setNotify(mode)} className="size-4 accent-primary" />
              {t(`notifyModes.${mode}`)}
            </label>
          ))}
          {notificationsLocked && <p className="text-xs text-muted-foreground">{t("notifyLocked")}</p>}
        </fieldset>
      </SettingsSection>

      <SettingsSection id="rsvp-whatsapp-section" title={t("sections.whatsapp.title")} description={t("sections.whatsapp.lead")}>
        <MessageField id="rsvp-whatsapp" label={t("whatsapp")} value={whatsapp} onChange={setWhatsapp} defaultText={whatsappDefault} max={WHATSAPP_MESSAGE_MAX} hint={t("whatsappHint")} rows={3} error={errors.whatsappMessage} />
      </SettingsSection>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end border-t border-border bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
