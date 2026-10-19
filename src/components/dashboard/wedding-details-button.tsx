"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { PencilLine } from "lucide-react";
import { updateWeddingDetailsAction } from "@/app/actions/websites";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type WeddingDetails = { id: string; title: string; weddingDate: string | null; location: string | null };

/** Names, date and place, which every card and the website share; editable without the website editor. */
export function WeddingDetailsButton({ wedding, variant = "outline" }: { wedding: WeddingDetails; variant?: "outline" | "link" }) {
  const t = useTranslations("dashboard.details");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={variant === "link" ? "sm" : "default"} className={variant === "link" ? "h-auto p-0" : undefined} onClick={() => setOpen(true)}>
        {variant === "outline" && <PencilLine aria-hidden />}
        {t("open")}
      </Button>
      {open && <DetailsDialog wedding={wedding} onClose={() => setOpen(false)} />}
    </>
  );
}

function DetailsDialog({ wedding, onClose }: { wedding: WeddingDetails; onClose: () => void }) {
  const t = useTranslations("dashboard.details");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(async (prev: unknown, form: FormData) => {
    const result = await updateWeddingDetailsAction(wedding.id, prev, form);
    if (result.ok) onClose();
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{t("title")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="details-title">{t("titleLabel")}</Label>
            <Input id="details-title" name="title" required defaultValue={wedding.title} />
            <FieldError code={errors.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="details-date">{t("dateLabel")}</Label>
            <Input id="details-date" name="weddingDate" type="date" defaultValue={wedding.weddingDate ?? undefined} />
            <FieldError code={errors.weddingDate} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="details-location">{t("locationLabel")}</Label>
            <Input id="details-location" name="location" defaultValue={wedding.location ?? undefined} />
            <FieldError code={errors.location} />
          </div>
          {state && !state.ok && state.error && <p role="alert" className="text-sm text-destructive">{tErrors(state.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
