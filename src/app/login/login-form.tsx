"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { requestMagicLinkAction } from "@/app/actions/auth";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(requestMagicLinkAction, null);
  const [dismissed, setDismissed] = useState<unknown>(null);

  if (state?.ok && dismissed !== state) {
    return (
      <div className="space-y-4" role="status">
        <MailCheck className="size-8 text-primary" aria-hidden />
        <h2 className="font-heading text-2xl">{t("sentTitle")}</h2>
        <p className="text-muted-foreground">{t("sentBody", { email: state.data.email })}</p>
        <Button variant="link" className="px-0" onClick={() => setDismissed(state)}>
          {t("sentAgain")}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">{t("emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t("emailPlaceholder")}
          aria-describedby="email-error"
          className="h-11"
        />
        <FieldError id="email-error" code={state && !state.ok ? state.fieldErrors?.email : undefined} />
      </div>
      {state && !state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors(state.error)}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
