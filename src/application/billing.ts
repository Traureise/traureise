import {
  activeTier,
  checkoutPrice,
  entitlementValidUntil,
  isActive,
  pricingTable,
  sellableTiers,
  type CheckoutPrice,
  type PaidTier,
  type PricingRow,
  type Tier,
} from "@/domain/billing";
import type { Deps } from "./deps";
import { InvalidSignatureError, NotFoundError, ValidationError } from "./errors";
import { loadWedding } from "./owned";
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

/** `prices`: what each sellable tier costs this wedding, after the credit for what it already paid. */
export type WeddingPlan = { weddingId: string; title: string; tier: Tier; sellable: PaidTier[]; prices: Partial<Record<PaidTier, CheckoutPrice>> };

/** Packages belong to the wedding (and are managed by its admins): everything in it (every version, card and the guest list) shares them. */
export class ListWeddingPlans {
  constructor(private deps: Deps) {}

  async execute(userId: string): Promise<WeddingPlan[]> {
    const { weddings, billingRepo, billing, clock } = this.deps;
    if (!billing.enabled) return [];
    const now = clock.now();
    const plans: WeddingPlan[] = [];
    // Packages are the admins' business: an editor sees none of this.
    for (const wedding of (await weddings.listForMember(userId)).filter((w) => w.role === "admin")) {
      const entitlements = await billingRepo.listByWedding(wedding.id);
      const sellable = sellableTiers(billing.offers, billing.unlockedTiers, entitlements, now);
      plans.push({
        weddingId: wedding.id,
        title: wedding.title,
        tier: activeTier(entitlements, now),
        sellable,
        prices: Object.fromEntries(sellable.map((tier) => [tier, checkoutPrice(tier, billing.offers, entitlements, now)])),
      });
    }
    return plans;
  }
}

export type Purchase = { weddingId: string; weddingTitle: string; tier: PaidTier; purchasedAt: Date; validUntil: Date; active: boolean; purchasedBy: { id: string; name: string } | null };

export class ListPurchases {
  constructor(private deps: Deps) {}

  async execute(userId: string): Promise<Purchase[]> {
    const { weddings, billingRepo, billing, clock, users } = this.deps;
    if (!billing.enabled) return [];
    const titles = new Map((await weddings.listForMember(userId)).map((w) => [w.id, w.title]));
    const now = clock.now();
    const entitlements = await billingRepo.listForAdmin(userId);
    // The buyer is shown by first name, or by email while there is none; null once the account is gone.
    const buyers = new Map<string, { id: string; name: string } | null>();
    for (const id of new Set(entitlements.flatMap((e) => (e.purchasedBy ? [e.purchasedBy] : [])))) {
      const buyer = await users.findById(id);
      buyers.set(id, buyer ? { id: buyer.id, name: buyer.firstName || buyer.email } : null);
    }
    return entitlements.map((e) => ({
      weddingId: e.weddingId,
      weddingTitle: titles.get(e.weddingId) ?? "",
      tier: e.tier,
      purchasedAt: e.createdAt,
      validUntil: e.validUntil,
      active: isActive(e, now),
      purchasedBy: e.purchasedBy ? (buyers.get(e.purchasedBy) ?? null) : null,
    }));
  }
}

export class StartCheckout {
  constructor(private deps: Deps) {}

  async execute(user: Pick<User, "id" | "email">, weddingId: string, tier: PaidTier): Promise<{ url: string }> {
    const provider = payments(this.deps);
    const { billing, billingRepo, clock, tokens, appUrl } = this.deps;
    await loadWedding(this.deps, user.id, weddingId, "admin");
    const entitlements = await billingRepo.listByWedding(weddingId);
    const offer = billing.offers.find((o) => o.tier === tier);
    const now = clock.now();
    if (!offer?.productId || !sellableTiers(billing.offers, billing.unlockedTiers, entitlements, now).includes(tier)) {
      throw new ValidationError({ tier: "not_available" });
    }
    // An upgrade pays only the difference; the webhook then grants the tier as for any purchase of the product.
    const { dueCents, creditCents } = checkoutPrice(tier, billing.offers, entitlements, now);
    return provider.createCheckout({
      ...(creditCents > 0 && { priceCents: dueCents }),
      productId: offer.productId,
      weddingId,
      tier,
      userId: user.id,
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
      purchasedBy: event.userId,
    };
  }
}
