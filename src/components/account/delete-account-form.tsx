"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { deleteAccountAction } from "@/app/actions/account";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteAccountForm() {
  const t = useTranslations("account.delete");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(deleteAccountAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="confirm-email">{t("confirmLabel")}</Label>
        <Input id="confirm-email" name="email" type="email" autoComplete="off" required aria-describedby="confirm-email-error" className="h-11 max-w-sm" />
        <FieldError id="confirm-email-error" code={state && !state.ok ? state.fieldErrors?.email : undefined} />
      </div>
      {/* A wedding became blocking after the page loaded (the page itself lists them instead of this form). */}
      {state && !state.ok && state.fieldErrors?._ === "last_admin" && (
        <p role="alert" className="text-sm text-destructive">
          {t("blockedNow")}
        </p>
      )}
      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors(state.error)}
        </p>
      )}
      <Button type="submit" variant="destructive" disabled={pending}>
        <Trash2 aria-hidden />
        {pending ? t("deleting") : t("button")}
      </Button>
    </form>
  );
}
