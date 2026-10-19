"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createCardAction, createCardForNewWeddingAction } from "@/app/actions/cards";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CardKind } from "@/domain/cards";

export type WebsiteChoice = { id: string; title: string };

/**
 * Creates a card (or opens the existing one: one per kind and wedding). With one wedding it goes straight to
 * the editor; with several the couple picks the wedding; without one they enter names and date, which starts
 * the wedding without a website.
 */
export function useCreateCard(websites: WebsiteChoice[]) {
  const t = useTranslations("errors");
  const [kind, setKind] = useState<CardKind | null>(null);
  const [newKind, setNewKind] = useState<CardKind | null>(null);
  const [pending, start] = useTransition();

  function create(websiteId: string, cardKind: CardKind) {
    start(async () => {
      const result = await createCardAction(websiteId, cardKind);
      if (result && !result.ok) toast.error(t(result.error ?? "unknown"));
    });
  }

  function choose(cardKind: CardKind) {
    if (websites.length === 0) setNewKind(cardKind);
    else if (websites.length === 1) create(websites[0]!.id, cardKind);
    else setKind(cardKind);
  }

  const dialog = (
    <>
      <PickWebsiteDialog kind={kind} websites={websites} pending={pending} onClose={() => setKind(null)} onPick={(id) => kind && create(id, kind)} />
      {newKind && <NewWeddingDialog key={newKind} kind={newKind} onClose={() => setNewKind(null)} />}
    </>
  );
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

/** The couple's first step is a card: names and date are all it needs; the website can follow any time. */
function NewWeddingDialog({ kind, onClose }: { kind: CardKind; onClose: () => void }) {
  const t = useTranslations("dashboard.newWedding");
  const tKinds = useTranslations("cardKinds");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(createCardForNewWeddingAction.bind(null, kind), null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-medium">{t("title", { kind: tKinds(kind) })}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="new-wedding-title">{t("titleLabel")}</Label>
            <Input id="new-wedding-title" name="title" required placeholder={t("titlePlaceholder")} />
            <FieldError code={errors.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-wedding-date">{t("dateLabel")}</Label>
            <Input id="new-wedding-date" name="weddingDate" type="date" />
            <FieldError code={errors.weddingDate} />
          </div>
          {state && !state.ok && state.error && <p role="alert" className="text-sm text-destructive">{tErrors(state.error)}</p>}
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
