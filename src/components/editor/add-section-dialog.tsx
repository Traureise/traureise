"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addSectionAction } from "@/app/actions/editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SECTION_TEMPLATES, type SectionTemplate } from "@/domain/sections";

/** "+ Abschnitt": an empty section or one section of the standard template; then opens it. */
export function AddSectionDialog({ websiteId, base, open, onOpenChange }: { websiteId: string; base: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("editor.sections");
  const tTitles = useTranslations("sections.titles");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [choice, setChoice] = useState<SectionTemplate | "">("");
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await addSectionAction(websiteId, choice || null);
      if (!result.ok) {
        toast.error(tErrors(result.error ?? "unknown"));
        return;
      }
      toast.success(t("created"));
      onOpenChange(false);
      router.push(`${base}/${result.data}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{t("add")}</DialogTitle>
          <DialogDescription>{t("addLead")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="min-w-0 space-y-5" aria-label={t("add")}>
          <div className="space-y-2">
            <Label htmlFor="add-section-choice">{t("fromTemplate")}</Label>
            <select
              id="add-section-choice"
              value={choice}
              onChange={(e) => setChoice(e.target.value as SectionTemplate | "")}
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">{t("empty")}</option>
              {SECTION_TEMPLATES.map((template) => (
                <option key={template} value={template}>
                  {tTitles(template)}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
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
