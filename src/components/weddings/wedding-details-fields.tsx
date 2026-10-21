"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/forms/date-field";
import { FieldError } from "@/components/forms/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/domain/result";

export type WeddingDetailsValue = { title: string; weddingDate: string | null };

/**
 * The one component for a wedding's names and "Habt ihr schon ein Datum?" with the date on yes. Form fields:
 * title, hasDate ("yes"/"no"), weddingDate. Place, time zone and address are on the Hochzeit tab only.
 */
export function WeddingDetailsFields({ idPrefix, value, errors }: { idPrefix: string; value?: WeddingDetailsValue; errors: FieldErrors }) {
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
    </div>
  );
}
