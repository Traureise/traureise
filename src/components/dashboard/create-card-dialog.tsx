"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createCardAction } from "@/app/actions/cards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CardKind } from "@/domain/cards";

export type WebsiteChoice = { id: string; title: string };

/**
 * Creates a card (or opens the existing one: one per kind and website). With one website it goes straight to
 * the editor; with several the couple picks the website; without one they are asked to create it first.
 */
export function useCreateCard(websites: WebsiteChoice[], onNeedWebsite: () => void) {
  const t = useTranslations("errors");
  const [kind, setKind] = useState<CardKind | null>(null);
  const [pending, start] = useTransition();

  function create(websiteId: string, cardKind: CardKind) {
    start(async () => {
      const result = await createCardAction(websiteId, cardKind);
      if (result && !result.ok) toast.error(t(result.error ?? "unknown"));
    });
  }

  function choose(cardKind: CardKind) {
    if (websites.length === 0) onNeedWebsite();
    else if (websites.length === 1) create(websites[0]!.id, cardKind);
    else setKind(cardKind);
  }

  const dialog = <PickWebsiteDialog kind={kind} websites={websites} pending={pending} onClose={() => setKind(null)} onPick={(id) => kind && create(id, kind)} />;
  return { choose, dialog, pending };
}

function PickWebsiteDialog({ kind, websites, pending, onClose, onPick }: { kind: CardKind | null; websites: WebsiteChoice[]; pending: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const t = useTranslations("dashboard.createCard");
  const tKinds = useTranslations("cardKinds");
  const [selected, setSelected] = useState(websites[0]?.id ?? "");
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{kind ? t("title", { kind: tKinds(kind) }) : ""}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t("website")}</legend>
          {websites.map((w) => (
            <label key={w.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm has-checked:border-primary">
              <input type="radio" name="card-website" value={w.id} checked={selected === w.id} onChange={() => setSelected(w.id)} className="size-4 accent-primary" />
              {w.title}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={pending || !selected} onClick={() => onPick(selected)}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
