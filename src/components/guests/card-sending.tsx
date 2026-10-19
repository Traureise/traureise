"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BellRing, CheckCheck, Mail, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { markCardsSentAction, sendCardEmailsAction, sendRemindersAction, setCardExcludedAction, shareCardAction } from "@/app/actions/cards";
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
import { CopyLinkButton } from "@/components/share/copy-link-button";
import { WhatsAppButton } from "@/components/share/whatsapp-button";
import type { HouseholdCardKind } from "@/domain/cards";

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
export function CardSendButtons({
  weddingId,
  kind,
  household,
  message,
  emailSending,
  excluded,
  sent,
  markedByHand,
}: {
  weddingId: string;
  kind: HouseholdCardKind;
  household: Household;
  message: string;
  emailSending: boolean;
  excluded: boolean;
  /** The household has this card (any version, any channel). */
  sent: boolean;
  /** …because the couple marked it by hand, which can be undone. */
  markedByHand: boolean;
}) {
  const t = useTranslations("guests.sending");
  const tKinds = useTranslations("cardKinds");
  const tList = useTranslations("guests.list");
  const { pending, run } = useRun();
  const share = (via: "whatsapp" | "link") => run(() => shareCardAction(weddingId, kind, household.id, via));
  if (excluded) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setCardExcludedAction(weddingId, kind, household.id, false))}>
        {t("include")}
      </Button>
    );
  }
  return (
    <>
      <WhatsAppButton message={message} name={household.name} link={household.link} onOpened={() => share("whatsapp")} />
      <CopyLinkButton url={household.link} copiedMessage={tList("linkCopied", { household: household.name })} onCopied={() => share("link")} />
      {household.email && emailSending && (
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => sendCardEmailsAction(weddingId, kind, { householdId: household.id }), () => toast.success(t("emailQueued", { household: household.name })))}>
          <Mail aria-hidden />
          {t("email")}
        </Button>
      )}
      {!sent && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => markCardsSentAction(weddingId, kind, { householdId: household.id }, true), () => toast.success(t("markedSent", { kind: tKinds(kind), household: household.name })))}
        >
          <CheckCheck aria-hidden />
          {t("markSent")}
        </Button>
      )}
      {markedByHand && (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => markCardsSentAction(weddingId, kind, { householdId: household.id }, false))}>
          <Undo2 aria-hidden />
          {t("unmarkSent")}
        </Button>
      )}
      {!sent && (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setCardExcludedAction(weddingId, kind, household.id, true))}>
          {t("exclude")}
        </Button>
      )}
    </>
  );
}

/** "Alle als gesendet markieren": for cards the couple sent themselves, outside the app. */
export function MarkAllSentButton({ weddingId, kind, count }: { weddingId: string; kind: HouseholdCardKind; count: number }) {
  const t = useTranslations("guests.sending");
  const tKinds = useTranslations("cardKinds");
  const { pending, run } = useRun();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" disabled={pending || count === 0}>
          <CheckCheck aria-hidden />
          {t("markAll", { count })}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("markAllTitle", { kind: tKinds(kind), count })}</AlertDialogTitle>
          <AlertDialogDescription>{t("markAllBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => markCardsSentAction(weddingId, kind, "all", true), (data) => toast.success(t("markedAll", { count: data.marked })))}>
            {t("markAllConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "Per E-Mail an alle senden" after a confirmation that shows the count. */
export function SendAllButton({ weddingId, kind, count }: { weddingId: string; kind: HouseholdCardKind; count: number }) {
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
          <AlertDialogAction onClick={() => run(() => sendCardEmailsAction(weddingId, kind, "all"), (data) => toast.success(t("queued", { count: data.queued })))}>
            {t("sendAllConfirm", { count })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Erinnerung senden for one open household: an email where there is an address, otherwise WhatsApp. */
export function ReminderButton({ weddingId, household, byEmail, message }: { weddingId: string; household: Household; byEmail: boolean; message: string }) {
  const t = useTranslations("guests.sending");
  const { pending, run } = useRun();
  if (!byEmail || !household.email) return <WhatsAppButton message={message} name={household.name} link={household.link} label={t("remind")} variant="outline" />;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => run(() => sendRemindersAction(weddingId, { householdId: household.id }), () => toast.success(t("reminderQueued", { household: household.name })))}
    >
      <BellRing aria-hidden />
      {t("remind")}
    </Button>
  );
}

/** Erinnerung an alle offenen: emails go out in the background; the rest are WhatsApp links to open one by one. */
export function RemindAllButton({ weddingId, open, withEmail }: { weddingId: string; open: number; withEmail: number }) {
  const t = useTranslations("guests.sending");
  const { pending, run } = useRun();
  const [whatsapp, setWhatsapp] = useState<{ householdId: string; name: string; message: string; link: string }[]>([]);
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
                  () => sendRemindersAction(weddingId, "all"),
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
                <WhatsAppButton message={w.message} name={w.name} link={w.link} />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
