"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createWeddingAction } from "@/app/actions/weddings";
import { Button } from "@/components/ui/button";
import { WeddingDetailsFields } from "./wedding-details-fields";

/** The Hochzeit form: names, whether there is a date yet, the date. Nothing else. */
export function NewWeddingForm() {
  const t = useTranslations("weddings.form");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(createWeddingAction, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={action} className="space-y-6" aria-label={t("title")}>
      <WeddingDetailsFields idPrefix="new-wedding" errors={errors} />
      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors(state.error)}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
