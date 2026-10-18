/** Paid tiers per wedding website, from free to everything. Each tier includes the ones before it. */
export const TIERS = ["website", "rsvp", "invitations", "complete"] as const;
export type Tier = (typeof TIERS)[number];
export type PaidTier = Exclude<Tier, "website">;
export const PAID_TIERS = ["rsvp", "invitations", "complete"] as const satisfies readonly PaidTier[];

/**
 * Which tier unlocks a feature. Setting up guests and designing cards is free; the tiers unlock sending:
 * `rsvp` active personal links, sharing them and notifications; `invitations` Save the Dates and invitations
 * (links, export), email sending and email reminders; `complete` thank-you cards and the engagement announcement.
 */
export const FEATURE_TIERS = {
  website: "website",
  qrCode: "website",
  themes: "website",
  guestList: "website",
  polls: "website",
  mealChoices: "website",
  rsvp: "rsvp",
  saveTheDates: "invitations",
  invitations: "invitations",
  emailSending: "invitations",
  emailReminders: "invitations",
  thankYouCards: "complete",
  engagementCards: "complete",
} as const satisfies Record<string, Tier>;
export type Feature = keyof typeof FEATURE_TIERS;

/** Tiers whose features all exist. A tier is only sold once it is released. */
const RELEASED_TIERS: readonly Tier[] = ["website", "rsvp", "invitations", "complete"];

export type Entitlement = { tier: PaidTier; purchaseRef: string; validUntil: Date; revokedAt: Date | null };

/** Price (in euro cents, VAT included) and payment-provider product for a paid tier. */
export type TierOffer = { tier: PaidTier; priceCents: number; productId: string | null };

const rank = (tier: Tier) => TIERS.indexOf(tier);

export function isActive(entitlement: Entitlement, now: Date): boolean {
  return !entitlement.revokedAt && entitlement.validUntil > now;
}

/** The highest tier a website currently has. */
export function activeTier(entitlements: readonly Entitlement[], now: Date): Tier {
  return entitlements.filter((e) => isActive(e, now)).reduce<Tier>((best, e) => (rank(e.tier) > rank(best) ? e.tier : best), "website");
}

export type FeatureContext = { billingEnabled: boolean; entitlements: readonly Entitlement[] };

/** The one feature gate. Without billing (self-hosted) everything is allowed. */
export function canUse(feature: Feature, context: FeatureContext, now: Date): boolean {
  if (!context.billingEnabled) return true;
  return rank(activeTier(context.entitlements, now)) >= rank(FEATURE_TIERS[feature]);
}

/**
 * An entitlement lasts until the end of the day 12 months after the wedding, or 12 months after
 * the purchase if no date is set or the wedding is already further back than the purchase.
 */
export function entitlementValidUntil(weddingDate: string | null, purchasedAt: Date): Date {
  const purchaseDay = purchasedAt.toISOString().slice(0, 10);
  return endOfDayTwelveMonthsAfter(weddingDate && weddingDate > purchaseDay ? weddingDate : purchaseDay);
}

/** The end (UTC) of the day 12 months after a calendar date; 29 February falls back to the 28th. */
export function endOfDayTwelveMonthsAfter(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const lastDayOfMonth = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return new Date(Date.UTC(y + 1, m - 1, Math.min(d, lastDayOfMonth) + 1));
}

/** `unlocked` lets tests sell tiers before their features are released (BILLING_TEST_UNLOCK_TIERS). */
export function isTierReleased(tier: Tier, unlocked: readonly Tier[] = []): boolean {
  return RELEASED_TIERS.includes(tier) || unlocked.includes(tier);
}

/** Tiers a website can buy now: released, with a product, and above what it already has. */
export function sellableTiers(
  offers: readonly TierOffer[],
  unlocked: readonly Tier[],
  entitlements: readonly Entitlement[],
  now = new Date(),
): PaidTier[] {
  const current = rank(activeTier(entitlements, now));
  return offers.filter((o) => o.productId && isTierReleased(o.tier, unlocked) && rank(o.tier) > current).map((o) => o.tier);
}

export type PricingRow = { tier: Tier; priceCents: number; status: "included" | "available" | "comingSoon" };

export function pricingTable(offers: readonly TierOffer[], unlocked: readonly Tier[]): PricingRow[] {
  return [
    { tier: "website", priceCents: 0, status: "included" },
    ...offers.map((o): PricingRow => ({
      tier: o.tier,
      priceCents: o.priceCents,
      status: isTierReleased(o.tier, unlocked) && o.productId ? "available" : "comingSoon",
    })),
  ];
}
