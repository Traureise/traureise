"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CardKind } from "@/domain/cards";
import { useCreateCard, type WebsiteChoice } from "./create-card-dialog";
import { CreateWebsiteDialog, type ThemeOption } from "./create-website-dialog";

const CARD_ENTRIES: { key: string; kind: CardKind }[] = [
  { key: "invitation", kind: "invitation" },
  { key: "saveTheDate", kind: "saveTheDate" },
  { key: "thankYou", kind: "thankYou" },
  { key: "engagement", kind: "engagement" },
];

export function CreateMenu({ themes, appUrl, websites }: { themes: ThemeOption[]; appUrl: string; websites: WebsiteChoice[] }) {
  const t = useTranslations("dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { choose, dialog, pending } = useCreateCard(websites, () => {
    toast.info(t("createCard.needWebsite"));
    setDialogOpen(true);
  });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="lg" disabled={pending}>
            <Plus aria-hidden />
            {t("create")}
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>{t("createMenu.website")}</DropdownMenuItem>
          {CARD_ENTRIES.map((entry) => (
            <DropdownMenuItem key={entry.key} onSelect={() => choose(entry.kind)}>
              {t(`createMenu.${entry.key}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWebsiteDialog open={dialogOpen} onOpenChange={setDialogOpen} themes={themes} appUrl={appUrl} />
      {dialog}
    </>
  );
}

/** "Save the Date erstellen" in an empty tab. */
export function CreateCardButton({ kind, label, websites, themes, appUrl }: { kind: CardKind; label: string; websites: WebsiteChoice[]; themes: ThemeOption[]; appUrl: string }) {
  const t = useTranslations("dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { choose, dialog, pending } = useCreateCard(websites, () => {
    toast.info(t("createCard.needWebsite"));
    setDialogOpen(true);
  });
  return (
    <>
      <Button variant="secondary" disabled={pending} onClick={() => choose(kind)}>
        <Plus aria-hidden />
        {label}
      </Button>
      <CreateWebsiteDialog open={dialogOpen} onOpenChange={setDialogOpen} themes={themes} appUrl={appUrl} />
      {dialog}
    </>
  );
}
