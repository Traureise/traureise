"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteWebsiteAction } from "@/app/actions/websites";
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

/** Deletes the whole wedding: website, cards, guest list and photos. `cardsOnly` words it for a wedding without a website. */
export function DeleteWebsiteButton({ websiteId, title, cardsOnly = false }: { websiteId: string; title: string; cardsOnly?: boolean }) {
  const t = useTranslations("dashboard");
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive hover:text-destructive">
          <Trash2 aria-hidden />
          {t("card.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(cardsOnly ? "deleteDialog.weddingTitle" : "deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t(cardsOnly ? "deleteDialog.weddingBody" : "deleteDialog.body", { title })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await deleteWebsiteAction(websiteId);
                if (result.ok) toast.success(t(cardsOnly ? "deleteDialog.weddingDone" : "deleteDialog.done"));
              })
            }
          >
            {t("deleteDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
