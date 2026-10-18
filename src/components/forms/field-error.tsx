"use client";

import { useTranslations } from "next-intl";

export function FieldError({ id, code }: { id?: string; code?: string }) {
  const t = useTranslations("errors");
  if (!code) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {t.has(code) ? t(code) : t("unknown")}
    </p>
  );
}
