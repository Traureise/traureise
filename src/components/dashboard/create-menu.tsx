"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CardKind } from "@/domain/cards";
import { useCreateCard, type WebsiteChoice } from "./create-card-dialog";
import { CreateWebsiteDialog, type ThemeOption, type WeddingDraft } from "./create-website-dialog";

/** In the order a couple needs them (my call); each can be created first, in any order. */
const ENTRIES: ({ key: string; kind: CardKind } | { key: "website"; kind: null })[] = [
  { key: "engagement", kind: "engagement" },
  { key: "saveTheDate", kind: "saveTheDate" },
  { key: "website", kind: null },
  { key: "invitation", kind: "invitation" },
  { key: "thankYou", kind: "thankYou" },
];

export function CreateMenu({ themes, appUrl, websites, drafts }: { themes: ThemeOption[]; appUrl: string; websites: WebsiteChoice[]; drafts: WeddingDraft[] }) {
  const t = useTranslations("dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { choose, dialog, pending } = useCreateCard(websites);
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
          {ENTRIES.map((entry) => (
            <DropdownMenuItem key={entry.key} onSelect={() => (entry.kind ? choose(entry.kind) : setDialogOpen(true))}>
              {t(`createMenu.${entry.key}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWebsiteDialog open={dialogOpen} onOpenChange={setDialogOpen} themes={themes} appUrl={appUrl} drafts={drafts} />
      {dialog}
    </>
  );
}

/** "Save the Date erstellen" in an empty tab. */
export function CreateCardButton({ kind, label, websites }: { kind: CardKind; label: string; websites: WebsiteChoice[] }) {
  const { choose, dialog, pending } = useCreateCard(websites);
  return (
    <>
      <Button variant="secondary" disabled={pending} onClick={() => choose(kind)}>
        <Plus aria-hidden />
        {label}
      </Button>
      {dialog}
    </>
  );
}
