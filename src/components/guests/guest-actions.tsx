"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { decideGuestRequestAction } from "@/app/actions/guests";
import { Button } from "@/components/ui/button";

/** Zur Gästeliste / Ablehnen for a household's request to bring someone. */
export function RequestActions({ weddingId, requestId }: { weddingId: string; requestId: string }) {
  const t = useTranslations("guests.overview");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const decide = (decision: "added" | "declined") =>
    start(async () => {
      const result = await decideGuestRequestAction(weddingId, requestId, decision);
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
