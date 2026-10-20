"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DateField } from "@/components/forms/date-field";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "./image-field";
import type { FieldSpec } from "./block-fields";
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

/** A form for one block or event, laid out from field specs. */
export function FieldForm({ weddingId, fields, initial, idPrefix, label, onSubmit, onDone }: Props) {
  const t = useTranslations();
  const { pending, errors, save, dismiss } = useSave();
  const [images, setImages] = useState<Record<string, string | null>>(
    Object.fromEntries(fields.filter((f) => f.type === "image").map((f) => [f.name, (initial[f.name] as string | null) ?? null])),
  );

  function submit(form: FormData) {
    const data: Record<string, unknown> = {};
    for (const field of fields) data[field.name] = field.type === "image" ? images[field.name] : String(form.get(field.name) ?? "");
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
          <select {...common} defaultValue={(value as string) ?? ""} className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm">
            <option value="" disabled>
              {t("editor.fields.chooseOption")}
            </option>
            {field.options!.map((option) => (
              <option key={option} value={option}>
                {t(`${field.optionLabels}.${option}`)}
              </option>
            ))}
          </select>
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
      onChange={(e) => dismiss((e.target as EventTarget as HTMLInputElement).name)} className="space-y-4 rounded-xl border border-primary/30 bg-background p-4" aria-label={label}>
      {fields.map((field) => (
        <div key={field.name}>{input(field)}</div>
      ))}
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
