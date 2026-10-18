"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { saveProfileAction } from "@/app/actions/auth";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(saveProfileAction, null);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="firstName">{t("firstNameLabel")}</Label>
        <Input id="firstName" name="firstName" autoComplete="given-name" required className="h-11" aria-describedby="firstName-error" />
        <FieldError id="firstName-error" code={state && !state.ok ? state.fieldErrors?.firstName : undefined} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {t("continue")}
      </Button>
    </form>
  );
}
