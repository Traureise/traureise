"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Download, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { deleteCardAction } from "@/app/actions/cards";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CardKind } from "@/domain/cards";

/** PNG and PDF downloads; without the card's package the button leads to the prices. */
export function ExportMenu({ exportUrl, active }: { exportUrl: string; active: boolean }) {
  const t = useTranslations("dashboard.cardItem");
  if (!active) {
    return (
      <Button asChild variant="outline">
        <Link href="/preise">
          <Lock aria-hidden />
          {t("export")}
        </Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download aria-hidden />
          {t("export")}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(["a6", "a5", "png"] as const).map((format) => (
          <DropdownMenuItem key={format} asChild>
            <a href={`${exportUrl}?format=${format}`} download>
              {t(`formats.${format}`)}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeleteCardButton({ websiteId, kind, name }: { websiteId: string; kind: CardKind; name: string }) {
  const t = useTranslations("dashboard.cardItem");
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive hover:text-destructive">
          <Trash2 aria-hidden />
          {t("delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await deleteCardAction(websiteId, kind);
                if (result.ok) toast.success(t("deleted"));
              })
            }
          >
            {t("deleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
