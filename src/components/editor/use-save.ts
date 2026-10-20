"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FieldErrors } from "@/domain/result";

type Result = { ok: true } | { ok: false; fieldErrors?: FieldErrors; error?: string };

/** Runs an editor action, tracks field errors and confirms success with a toast. */
export function useSave() {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});

  function save(run: () => Promise<Result>, onSuccess?: () => void) {
    start(async () => {
      const result = await run();
      if (result.ok) {
        setErrors({});
        toast.success(t("editor.saved"));
        onSuccess?.();
      } else {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(t(`errors.${result.error}`));
      }
    });
  }

  /** Hides a field's error once the field changes; the next save checks it again. */
  function dismiss(field: string) {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  return { pending, errors, save, dismiss };
}
