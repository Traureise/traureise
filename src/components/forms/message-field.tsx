"use client";

import { useTranslations } from "next-intl";
import { FieldError } from "@/components/forms/field-error";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The text used while the field is empty (shown as placeholder). */
  defaultText: string;
  max: number;
  /** "{name}" becomes the household's name; false for texts that go to everyone. */
  personalized?: boolean;
  /** What the text is used for. */
  hint?: string;
  rows?: number;
  error?: string;
};

/**
 * The one field for the couple's texts to guests (card message, reminder, RSVP WhatsApp text): label, the
 * `{name}` hint, "leer lassen für den Standardtext" and the length limit.
 */
export function MessageField({ id, label, value, onChange, defaultText, max, personalized = true, hint, rows = 4, error }: Props) {
  const t = useTranslations("forms");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={rows} value={value} maxLength={max} placeholder={defaultText} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
        <span>{[hint, personalized ? t("messageHint") : null, t("messageDefault")].filter(Boolean).join(" ")}</span>
        <span className="tabular-nums">{t("messageCount", { count: value.length, max })}</span>
      </p>
      <FieldError code={error} />
    </div>
  );
}
