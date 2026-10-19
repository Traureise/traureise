"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";
import { updateWeddingDetailsAction } from "@/app/actions/weddings";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WeddingDetailsFields } from "./wedding-details-fields";

export type WeddingDetails = { id: string; title: string; weddingDate: string | null; location: string | null; timezone: string; slug: string };

/** "Angaben ändern": names, date, place, time zone and the wedding's address, from anywhere in the wedding. */
export function WeddingDetailsButton({
  wedding,
  appUrl,
  timeZones,
  variant = "outline",
  label,
}: {
  wedding: WeddingDetails;
  appUrl: string;
  timeZones: string[];
  variant?: "outline" | "link";
  label?: string;
}) {
  const t = useTranslations("weddings.details");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size="sm" className={variant === "link" ? "h-auto p-0" : undefined} onClick={() => setOpen(true)}>
        {variant === "outline" && <PencilLine aria-hidden />}
        {label ?? t("open")}
      </Button>
      {open && <DetailsDialog wedding={wedding} appUrl={appUrl} timeZones={timeZones} onClose={() => setOpen(false)} />}
    </>
  );
}

function DetailsDialog({ wedding, appUrl, timeZones, onClose }: { wedding: WeddingDetails; appUrl: string; timeZones: string[]; onClose: () => void }) {
  const t = useTranslations("weddings.details");
  const tFields = useTranslations("weddings.fields");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(async (prev: unknown, form: FormData) => {
    const result = await updateWeddingDetailsAction(wedding.id, prev, form);
    if (result.ok) {
      toast.success(t("saved"));
      onClose();
    }
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{t("title")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        <form action={action} className="min-w-0 space-y-5" aria-label={t("title")}>
          <WeddingDetailsFields idPrefix="details" value={wedding} errors={errors} withPlace timeZones={timeZones} />
          <div className="space-y-2">
            <Label htmlFor="details-slug">{tFields("slugLabel")}</Label>
            <div className="flex min-w-0 items-center rounded-lg border border-input focus-within:ring-3 focus-within:ring-ring/50">
              <span className="truncate pl-3 text-sm whitespace-nowrap text-muted-foreground">{appUrl.replace(/^https?:\/\//, "")}/</span>
              <Input id="details-slug" name="slug" defaultValue={wedding.slug} className="min-w-0 border-0 pl-0.5 focus-visible:ring-0" aria-describedby="details-slug-hint" />
            </div>
            <p id="details-slug-hint" className="text-xs text-muted-foreground">
              {tFields("slugHint")}
            </p>
            <FieldError code={errors.slug} />
          </div>
          {state && !state.ok && state.error && (
            <p role="alert" className="text-sm text-destructive">
              {tErrors(state.error)}
            </p>
          )}
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
