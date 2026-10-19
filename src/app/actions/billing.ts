"use server";

import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { PAID_TIERS, type PaidTier } from "@/domain/billing";
import { runAction } from "@/lib/action-result";
import { requireProfile } from "@/lib/session";

/** Sends the buyer to the payment provider's hosted checkout. */
export async function startCheckoutAction(form: FormData): Promise<void> {
  const user = await requireProfile();
  const tier = String(form.get("tier") ?? "");
  const weddingId = String(form.get("weddingId") ?? "");
  const result = PAID_TIERS.includes(tier as PaidTier)
    ? await runAction(() => container().startCheckout.execute(user, weddingId, tier as PaidTier))
    : ({ ok: false } as const);
  redirect(result.ok ? result.data.url : "/preise?fehler=checkout");
}
