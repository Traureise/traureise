"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/forms/date-field";
import { TimeField } from "@/components/forms/time-field";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "./image-field";
import { normalizeTime } from "@/domain/days";
import type { FieldGroup, FieldSpec } from "./block-fields";
import { useSave } from "./use-save";

type Props = {
  /** Photos belong to the wedding. */
  weddingId: string;
  fields: FieldSpec[];
  initial: Record<string, unknown>;
  /** Keeps input ids unique when several forms are on the page. */
  idPrefix: string;
  /** The form's accessible name. */
  label: string;
  onSubmit: (data: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; fieldErrors?: Record<string, string>; error?: string }>;
  onDone: () => void;
};

/** Consecutive fields of one group, in order; fields without a group form one unnamed group. */
function groupsOf(fields: FieldSpec[]): { group: FieldGroup | undefined; fields: FieldSpec[] }[] {
  const groups: { group: FieldGroup | undefined; fields: FieldSpec[] }[] = [];
  for (const field of fields) {
    const last = groups.at(-1);
    if (last && last.group === field.group) last.fields.push(field);
    else groups.push({ group: field.group, fields: [field] });
  }
  return groups;
}

/** A form for one block or event, laid out from field specs (in named groups, two columns on wide screens). */
export function FieldForm({ weddingId, fields, initial, idPrefix, label, onSubmit, onDone }: Props) {
  const t = useTranslations();
  const { pending, errors, save, dismiss } = useSave();
  const [images, setImages] = useState<Record<string, string | null>>(
    Object.fromEntries(fields.filter((f) => f.type === "image").map((f) => [f.name, (initial[f.name] as string | null) ?? null])),
  );

  function submit(form: FormData) {
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = field.type === "image" ? images[field.name] : String(form.get(field.name) ?? "");
      data[field.name] = field.type === "time" ? normalizeTime(raw as string) : raw;
    }
    save(() => onSubmit(data), onDone);
  }

  function input(field: FieldSpec) {
    const id = `${idPrefix}-${field.name}`;
    const label = t(`editor.fields.${field.name === "imageKey" ? "image" : field.name}`);
    const value = initial[field.name];
    const common = { id, name: field.name, "aria-describedby": `${id}-error`, "aria-invalid": errors[field.name] ? true : undefined };
    if (field.type === "image") {
      return (
        <ImageField
          weddingId={weddingId}
          label={label}
          value={images[field.name] ?? null}
          onChange={(key) => {
            setImages((prev) => ({ ...prev, [field.name]: key }));
            dismiss(field.name);
          }}
          error={errors[field.name]}
        />
      );
    }
    if (field.type === "date") return <DateField id={id} name={field.name} label={label} value={(value as string) ?? ""} error={errors[field.name]} />;
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        {field.type === "textarea" ? (
          <Textarea {...common} rows={3} defaultValue={(value as string) ?? ""} />
        ) : field.type === "select" ? (
          <select {...common} defaultValue={(value as string) ?? ""} className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm">
            <option value="" disabled>
              {t("editor.fields.chooseOption")}
            </option>
            {field.options!.map((option) => (
              <option key={option} value={option}>
                {t(`${field.optionLabels}.${option}`)}
              </option>
            ))}
          </select>
        ) : field.type === "time" ? (
          <TimeField {...common} defaultValue={(value as string) ?? ""} className="w-28" />
        ) : (
          <Input {...common} type={field.type === "url" ? "text" : field.type} inputMode={field.type === "url" ? "url" : undefined} defaultValue={(value as string) ?? ""} />
        )}
        <FieldError id={`${id}-error`} code={errors[field.name]} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => (e.preventDefault(), submit(new FormData(e.currentTarget)))}
      onChange={(e) => {
        const target = e.target as EventTarget as HTMLInputElement;
        dismiss(target.name || target.dataset.field || "");
      }} className="@container space-y-4 rounded-xl border border-primary/30 bg-background p-4" aria-label={label}>
      {groupsOf(fields).map(({ group, fields: groupFields }) => {
        const grid = (
          <div className="grid gap-4 @lg:grid-cols-2">
            {groupFields.map((field) => (
              <div key={field.name} className={field.half ? undefined : "@lg:col-span-2"}>
                {input(field)}
              </div>
            ))}
          </div>
        );
        return group ? (
          <div key={group} className="gap-x-6 border-t border-border pt-4 first:border-t-0 first:pt-0 @2xl:grid @2xl:grid-cols-[5rem_minmax(0,1fr)]">
            <p className="mb-3 font-heading text-base font-medium @2xl:mb-0 @2xl:pt-0.5" aria-hidden>
              {t(`editor.fieldGroups.${group}`)}
            </p>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="sr-only">{t(`editor.fieldGroups.${group}`)}</legend>
              {grid}
            </fieldset>
          </div>
        ) : (
          <div key="fields">{grid}</div>
        );
      })}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("editor.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>
    </form>
  );
}
