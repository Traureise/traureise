"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { normalizeTime } from "@/domain/days";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "defaultValue"> & { defaultValue?: string };

/** A 24-hour time (HH:MM) whatever the browser's language; "930" or "9.30" become "09:30" on leaving the field. */
export function TimeField({ onBlur, ...props }: Props) {
  const t = useTranslations("forms");
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      placeholder={t("timePlaceholder")}
      onBlur={(e) => {
        e.currentTarget.value = normalizeTime(e.currentTarget.value);
        onBlur?.(e);
      }}
    />
  );
}
