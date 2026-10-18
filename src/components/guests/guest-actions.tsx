"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { decideGuestRequestAction, deleteHouseholdAction } from "@/app/actions/guests";
import { Button } from "@/components/ui/button";

export function DeleteHouseholdButton({ websiteId, householdId, name }: { websiteId: string; householdId: string; name: string }) {
  const t = useTranslations("guests.household");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t("confirmDelete", { name }))) return;
        start(async () => {
          const result = await deleteHouseholdAction(websiteId, householdId);
          if (result.ok) toast.success(t("deleted"));
          router.refresh();
        });
      }}
    >
      <Trash2 aria-hidden />
      {t("delete")}
    </Button>
  );
}

/** Zur Gästeliste / Ablehnen for a household's request to bring someone. */
export function RequestActions({ websiteId, requestId }: { websiteId: string; requestId: string }) {
  const t = useTranslations("guests.overview");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const decide = (decision: "added" | "declined") =>
    start(async () => {
      const result = await decideGuestRequestAction(websiteId, requestId, decision);
      if (!result.ok) toast.error(tErrors(result.error ?? "unknown"));
      router.refresh();
    });
  return (
    <span className="flex gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => decide("added")}>
        <Check aria-hidden />
        {t("addRequest")}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => decide("declined")}>
        <X aria-hidden />
        {t("declineRequest")}
      </Button>
    </span>
  );
}
