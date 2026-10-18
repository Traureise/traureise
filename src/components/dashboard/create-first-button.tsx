"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CreateWebsiteDialog, type ThemeOption } from "./create-website-dialog";

export function CreateFirstButton({ themes, appUrl }: { themes: ThemeOption[]; appUrl: string }) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("createFirst")}
      </Button>
      <CreateWebsiteDialog open={open} onOpenChange={setOpen} themes={themes} appUrl={appUrl} />
    </>
  );
}
