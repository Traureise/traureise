"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/forms/date-field";
import { FieldError } from "@/components/forms/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/domain/result";
import type { TimeZoneOption } from "@/lib/format";

export type WeddingDetailsValue = { title: string; weddingDate: string | null; location?: string | null; timezone?: string };

/**
 * The one component for a wedding's details: names, "Habt ihr schon ein Datum?" with the date on yes, and
 * optionally place and time zone. Form fields: title, hasDate ("yes"/"no"), weddingDate, location, timezone.
 */
export function WeddingDetailsFields({
  idPrefix,
  value,
  errors,
  withPlace = false,
  timeZones,
}: {
  idPrefix: string;
  value?: WeddingDetailsValue;
  errors: FieldErrors;
  withPlace?: boolean;
  /** Shows the time zone select. */
  /** German labels, built on the server (see timeZoneOptions). */
  timeZones?: TimeZoneOption[];
}) {
  const t = useTranslations("weddings.fields");
  const [hasDate, setHasDate] = useState(!!value?.weddingDate);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>{t("titleLabel")}</Label>
        <Input id={`${idPrefix}-title`} name="title" required placeholder={t("titlePlaceholder")} defaultValue={value?.title} />
        <FieldError code={errors.title} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("hasDate")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["yes", "no"] as const).map((answer) => (
            <label key={answer} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-primary has-checked:ring-2 has-checked:ring-primary/20">
              <input type="radio" name="hasDate" value={answer} checked={hasDate === (answer === "yes")} onChange={() => setHasDate(answer === "yes")} className="size-4 accent-primary" />
              {t(answer)}
            </label>
          ))}
        </div>
      </fieldset>
      {hasDate && <DateField id={`${idPrefix}-date`} name="weddingDate" label={t("dateLabel")} value={value?.weddingDate} error={errors.weddingDate} />}
      {withPlace && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-location`}>{t("locationLabel")}</Label>
          <Input id={`${idPrefix}-location`} name="location" defaultValue={value?.location ?? undefined} />
          <FieldError code={errors.location} />
        </div>
      )}
      {timeZones && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-timezone`}>{t("timezoneLabel")}</Label>
          <select id={`${idPrefix}-timezone`} name="timezone" defaultValue={value?.timezone} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm">
            {timeZones.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label}
              </option>
            ))}
          </select>
          <FieldError code={errors.timezone} />
        </div>
      )}
    </div>
  );
}
