"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BellRing, Mail, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { sendCardEmailsAction, sendRemindersAction, setCardExcludedAction, shareCardAction } from "@/app/actions/cards";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { HouseholdCardKind } from "@/domain/cards";
import { whatsappUrl } from "@/domain/guests";
import { CopyLinkButton } from "./copy-link-button";

type Household = { id: string; name: string; email: string | null; link: string };

function useRun() {
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(action: () => Promise<{ ok: true; data: T } | { ok: false; error?: string; fieldErrors?: Record<string, string> }>, onDone?: (data: T) => void) =>
    start(async () => {
      const result = await action();
      if (result.ok) onDone?.(result.data);
      else toast.error(tErrors(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? "unknown"));
      router.refresh();
    });
  return { pending, run };
}

/**
 * Sending one card to one household: WhatsApp (a wa.me link the couple opens), Link kopieren, E-Mail, and
 * leaving the household out. WhatsApp and copied links are recorded as sent.
 */
export function CardSendButtons({ websiteId, kind, household, message, emailSending, excluded }: { websiteId: string; kind: HouseholdCardKind; household: Household; message: string; emailSending: boolean; excluded: boolean }) {
  const t = useTranslations("guests.sending");
  const { pending, run } = useRun();
  const share = (via: "whatsapp" | "link") => run(() => shareCardAction(websiteId, kind, household.id, via));
  if (excluded) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setCardExcludedAction(websiteId, kind, household.id, false))}>
        {t("include")}
      </Button>
    );
  }
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          // Opened right away (inside the click) so no popup blocker stops it; the send is recorded alongside.
          window.open(whatsappUrl(message, household.name, household.link), "_blank", "noopener,noreferrer");
          share("whatsapp");
        }}
      >
        <MessageCircle aria-hidden />
        {t("whatsapp")}
      </Button>
      <CopyLinkButton url={household.link} household={household.name} onCopied={() => share("link")} />
      {household.email && emailSending && (
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => sendCardEmailsAction(websiteId, kind, { householdId: household.id }), () => toast.success(t("emailQueued", { household: household.name })))}>
          <Mail aria-hidden />
          {t("email")}
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setCardExcludedAction(websiteId, kind, household.id, true))}>
        {t("exclude")}
      </Button>
    </>
  );
}

/** "Per E-Mail an alle senden" after a confirmation that shows the count. */
export function SendAllButton({ websiteId, kind, count }: { websiteId: string; kind: HouseholdCardKind; count: number }) {
  const t = useTranslations("guests.sending");
  const tKinds = useTranslations("cardKinds");
  const { pending, run } = useRun();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" disabled={pending || count === 0}>
          <Send aria-hidden />
          {t("sendAll", { count })}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("sendAllTitle", { kind: tKinds(kind), count })}</AlertDialogTitle>
          <AlertDialogDescription>{t("sendAllBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => sendCardEmailsAction(websiteId, kind, "all"), (data) => toast.success(t("queued", { count: data.queued })))}>
            {t("sendAllConfirm", { count })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Erinnerung senden for one open household: an email where there is an address, otherwise WhatsApp. */
export function ReminderButton({ websiteId, household, byEmail, message }: { websiteId: string; household: Household; byEmail: boolean; message: string }) {
  const t = useTranslations("guests.sending");
  const { pending, run } = useRun();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (byEmail && household.email) run(() => sendRemindersAction(websiteId, { householdId: household.id }), () => toast.success(t("reminderQueued", { household: household.name })));
        else window.open(whatsappUrl(message, household.name, household.link), "_blank", "noopener,noreferrer");
      }}
    >
      <BellRing aria-hidden />
      {t("remind")}
    </Button>
  );
}

/** Erinnerung an alle offenen: emails go out in the background; the rest are WhatsApp links to open one by one. */
export function RemindAllButton({ websiteId, open, withEmail }: { websiteId: string; open: number; withEmail: number }) {
  const t = useTranslations("guests.sending");
  const { pending, run } = useRun();
  const [whatsapp, setWhatsapp] = useState<{ householdId: string; name: string; url: string }[]>([]);
  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" disabled={pending || open === 0}>
            <BellRing aria-hidden />
            {t("remindAll", { count: open })}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("remindAllTitle", { count: open })}</AlertDialogTitle>
            <AlertDialogDescription>{t("remindAllBody", { email: withEmail, whatsapp: open - withEmail })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run(
                  () => sendRemindersAction(websiteId, "all"),
                  (data) => {
                    if (data.queued) toast.success(t("remindersQueued", { count: data.queued }));
                    setWhatsapp(data.whatsapp);
                  },
                )
              }
            >
              {t("remindAllConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={whatsapp.length > 0} onOpenChange={(next) => !next && setWhatsapp([])}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl font-medium">{t("whatsappListTitle")}</DialogTitle>
            <DialogDescription>{t("whatsappListBody")}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {whatsapp.map((w) => (
              <li key={w.householdId} className="flex items-center justify-between gap-3 text-sm">
                <span>{w.name}</span>
                <Button asChild size="sm" variant="secondary">
                  <a href={w.url} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden />
                    {t("whatsapp")}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
