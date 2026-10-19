import { activeTier, entitlementValidUntil, isActive, pricingTable, sellableTiers, type PaidTier, type PricingRow, type Tier } from "@/domain/billing";
import type { Deps } from "./deps";
import { InvalidSignatureError, NotFoundError, ValidationError } from "./errors";
import { loadOwnedWedding } from "./owned";
import type { BillingChange, PaymentEvent, User } from "./ports";

/** Billing only exists when it is switched on and a payment provider is configured. */
function payments(deps: Deps) {
  if (!deps.billing.enabled || !deps.payments) throw new NotFoundError();
  return deps.payments;
}

export class GetPricing {
  constructor(private deps: Deps) {}

  execute(): PricingRow[] | null {
    const { enabled, offers, unlockedTiers } = this.deps.billing;
    return enabled ? pricingTable(offers, unlockedTiers) : null;
  }
}

export type WeddingPlan = { weddingId: string; title: string; tier: Tier; sellable: PaidTier[] };

/** Packages belong to the wedding: everything in it (every version, card and the guest list) shares them. */
export class ListWeddingPlans {
  constructor(private deps: Deps) {}

  async execute(userId: string): Promise<WeddingPlan[]> {
    const { weddings, billingRepo, billing, clock } = this.deps;
    if (!billing.enabled) return [];
    const now = clock.now();
    const plans: WeddingPlan[] = [];
    for (const wedding of await weddings.listByOwner(userId)) {
      const entitlements = await billingRepo.listByWedding(wedding.id);
      plans.push({
        weddingId: wedding.id,
        title: wedding.title,
        tier: activeTier(entitlements, now),
        sellable: sellableTiers(billing.offers, billing.unlockedTiers, entitlements, now),
      });
    }
    return plans;
  }
}

export type Purchase = { weddingId: string; weddingTitle: string; tier: PaidTier; purchasedAt: Date; validUntil: Date; active: boolean };

export class ListPurchases {
  constructor(private deps: Deps) {}

  async execute(userId: string): Promise<Purchase[]> {
    const { weddings, billingRepo, billing, clock } = this.deps;
    if (!billing.enabled) return [];
    const titles = new Map((await weddings.listByOwner(userId)).map((w) => [w.id, w.title]));
    const now = clock.now();
    return (await billingRepo.listByOwner(userId)).map((e) => ({
      weddingId: e.weddingId,
      weddingTitle: titles.get(e.weddingId) ?? "",
      tier: e.tier,
      purchasedAt: e.createdAt,
      validUntil: e.validUntil,
      active: isActive(e, now),
    }));
  }
}

export class StartCheckout {
  constructor(private deps: Deps) {}

  async execute(user: Pick<User, "id" | "email">, weddingId: string, tier: PaidTier): Promise<{ url: string }> {
    const provider = payments(this.deps);
    const { billing, billingRepo, clock, tokens, appUrl } = this.deps;
    await loadOwnedWedding(this.deps, user.id, weddingId);
    const entitlements = await billingRepo.listByWedding(weddingId);
    const offer = billing.offers.find((o) => o.tier === tier);
    if (!offer?.productId || !sellableTiers(billing.offers, billing.unlockedTiers, entitlements, clock.now()).includes(tier)) {
      throw new ValidationError({ tier: "not_available" });
    }
    return provider.createCheckout({
      productId: offer.productId,
      weddingId,
      tier,
      customerEmail: user.email,
      successUrl: `${appUrl}/hochzeiten/${weddingId}?kauf=danke`,
      requestId: tokens.generate(),
    });
  }
}

/**
 * Applies a payment-provider webhook. Every authentic event is acknowledged, even one that cannot be
 * applied (unknown product, deleted wedding), so the provider does not retry it for a day.
 */
export class HandlePaymentWebhook {
  constructor(private deps: Deps) {}

  async execute(rawBody: string, signature: string | null): Promise<"applied" | "duplicate"> {
    const provider = payments(this.deps);
    const event = provider.parseWebhook(rawBody, signature);
    if (!event) throw new InvalidSignatureError();
    return this.deps.billingRepo.applyEvent(event.eventId, await this.changeFor(event, provider.name.toLowerCase()));
  }

  private async changeFor(event: PaymentEvent, providerId: string): Promise<BillingChange> {
    const now = this.deps.clock.now();
    if (event.type === "revoked") return event.purchaseRef ? { kind: "revoke", purchaseRef: event.purchaseRef, at: now } : { kind: "none" };
    if (event.type !== "paid" || !event.weddingId) return { kind: "none" };
    const tier = this.deps.billing.offers.find((o) => o.productId === event.productId)?.tier;
    const wedding = await this.deps.weddings.findById(event.weddingId).catch(() => null);
    if (!tier || !wedding) return { kind: "none" };
    return {
      kind: "grant",
      weddingId: wedding.id,
      tier,
      purchaseRef: event.purchaseRef,
      provider: providerId,
      validUntil: entitlementValidUntil(wedding.weddingDate, now),
    };
  }
}
