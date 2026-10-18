"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWebsiteDialog, type ThemeOption } from "./create-website-dialog";

const PLACEHOLDERS = [
  { key: "invitation", tab: "invitations" },
  { key: "saveTheDate", tab: "save-the-dates" },
  { key: "thankYou", tab: "cards" },
  { key: "engagement", tab: "cards" },
] as const;

export function CreateMenu({ themes, appUrl }: { themes: ThemeOption[]; appUrl: string }) {
  const t = useTranslations("dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="lg">
            <Plus aria-hidden />
            {t("create")}
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>{t("createMenu.website")}</DropdownMenuItem>
          {PLACEHOLDERS.map((p) => (
            <DropdownMenuItem key={p.key} asChild>
              <Link href={`/dashboard?tab=${p.tab}`}>{t(`createMenu.${p.key}`)}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWebsiteDialog open={dialogOpen} onOpenChange={setDialogOpen} themes={themes} appUrl={appUrl} />
    </>
  );
}
