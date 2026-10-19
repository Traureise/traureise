"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CreateWebsiteDialog, type ThemeOption, type WeddingDraft } from "./create-website-dialog";

/** "Hochzeitswebsite erstellen"; with `wedding`, the website of a wedding that so far only has cards. */
export function CreateFirstButton({ themes, appUrl, wedding, label }: { themes: ThemeOption[]; appUrl: string; wedding?: WeddingDraft; label?: string }) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {label ?? t("createFirst")}
      </Button>
      <CreateWebsiteDialog open={open} onOpenChange={setOpen} themes={themes} appUrl={appUrl} drafts={wedding ? [wedding] : []} fixed={!!wedding} />
    </>
  );
}
