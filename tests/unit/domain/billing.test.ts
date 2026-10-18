import { describe, expect, it } from "vitest";
import {
  activeTier,
  canUse,
  entitlementValidUntil,
  isTierReleased,
  pricingTable,
  sellableTiers,
  type Entitlement,
  type TierOffer,
} from "@/domain/billing";

const now = new Date("2026-10-18T10:00:00Z");
const entitlement = (over: Partial<Entitlement> = {}): Entitlement => ({
  tier: "rsvp",
  purchaseRef: "ord_1",
  validUntil: new Date("2028-06-12T00:00:00Z"),
  revokedAt: null,
  ...over,
});

const offers: TierOffer[] = [
  { tier: "rsvp", priceCents: 4900, productId: "prod_rsvp" },
  { tier: "invitations", priceCents: 13900, productId: "prod_inv" },
  { tier: "complete", priceCents: 14900, productId: "prod_all" },
];

describe("canUse", () => {
  it("allows everything when billing is off (self-hosted)", () => {
    expect(canUse("rsvp", { billingEnabled: false, entitlements: [] }, now)).toBe(true);
    expect(canUse("thankYouCards", { billingEnabled: false, entitlements: [] }, now)).toBe(true);
  });

  it("always allows the free website features", () => {
    expect(canUse("website", { billingEnabled: true, entitlements: [] }, now)).toBe(true);
    expect(canUse("qrCode", { billingEnabled: true, entitlements: [] }, now)).toBe(true);
  });

  it("lets every couple set up guests for free; sending needs the RSVP tier", () => {
    const free = { billingEnabled: true, entitlements: [] };
    for (const feature of ["guestList", "polls", "mealChoices"] as const) expect(canUse(feature, free, now)).toBe(true);
    expect(canUse("rsvp", free, now)).toBe(false);
  });

  it("needs an active entitlement of at least the feature's tier", () => {
    const ctx = { billingEnabled: true, entitlements: [entitlement({ tier: "rsvp" })] };
    expect(canUse("rsvp", ctx, now)).toBe(true);
    expect(canUse("mealChoices", ctx, now)).toBe(true);
    expect(canUse("invitations", ctx, now)).toBe(false);
    expect(canUse("thankYouCards", { billingEnabled: true, entitlements: [entitlement({ tier: "complete" })] }, now)).toBe(true);
    expect(canUse("rsvp", { billingEnabled: true, entitlements: [] }, now)).toBe(false);
  });

  it("gates v4: Save the Dates, invitations, email sending and reminders need Einladungen; cards need Komplett", () => {
    const rsvp = { billingEnabled: true, entitlements: [entitlement({ tier: "rsvp" })] };
    const invitations = { billingEnabled: true, entitlements: [entitlement({ tier: "invitations" })] };
    for (const feature of ["saveTheDates", "invitations", "emailSending", "emailReminders"] as const) {
      expect(canUse(feature, rsvp, now)).toBe(false);
      expect(canUse(feature, invitations, now)).toBe(true);
    }
    for (const feature of ["thankYouCards", "engagementCards"] as const) {
      expect(canUse(feature, invitations, now)).toBe(false);
      expect(canUse(feature, { billingEnabled: true, entitlements: [entitlement({ tier: "complete" })] }, now)).toBe(true);
    }
  });

  it("ignores revoked and expired entitlements", () => {
    const revoked = entitlement({ revokedAt: new Date("2026-10-01T00:00:00Z") });
    const expired = entitlement({ validUntil: new Date("2026-10-18T09:59:59Z") });
    expect(canUse("rsvp", { billingEnabled: true, entitlements: [revoked, expired] }, now)).toBe(false);
  });
});

describe("activeTier", () => {
  it("is the highest active tier, or the free website", () => {
    expect(activeTier([], now)).toBe("website");
    expect(activeTier([entitlement({ tier: "rsvp" }), entitlement({ tier: "complete", purchaseRef: "ord_2" })], now)).toBe("complete");
    expect(activeTier([entitlement({ tier: "complete", revokedAt: now })], now)).toBe("website");
  });
});

describe("entitlementValidUntil", () => {
  it("runs until 12 months after the wedding date", () => {
    expect(entitlementValidUntil("2027-06-12", now).toISOString()).toBe("2028-06-13T00:00:00.000Z");
  });

  it("runs until 12 months after the purchase when no date is set", () => {
    expect(entitlementValidUntil(null, now).toISOString()).toBe("2027-10-19T00:00:00.000Z");
  });

  it("never ends earlier than 12 months after the purchase", () => {
    expect(entitlementValidUntil("2025-01-01", now).toISOString()).toBe("2027-10-19T00:00:00.000Z");
  });

  it("handles leap days", () => {
    expect(entitlementValidUntil("2028-02-29", now).toISOString()).toBe("2029-03-01T00:00:00.000Z");
  });
});

describe("tier availability", () => {
  it("releases every tier now that all their features exist", () => {
    for (const tier of ["website", "rsvp", "invitations", "complete"] as const) expect(isTierReleased(tier)).toBe(true);
  });

  it("sells released tiers above the current one", () => {
    expect(sellableTiers(offers, [], [])).toEqual(["rsvp", "invitations", "complete"]);
    expect(sellableTiers(offers, [], [entitlement({ tier: "rsvp" })], now)).toEqual(["invitations", "complete"]);
    expect(sellableTiers(offers, [], [entitlement({ tier: "invitations" })], now)).toEqual(["complete"]);
  });

  it("does not sell tiers without a product id", () => {
    expect(sellableTiers([{ tier: "rsvp", priceCents: 4900, productId: null }], [], [])).toEqual([]);
  });
});

describe("pricingTable", () => {
  it("lists the free website and every paid tier with its status", () => {
    expect(pricingTable(offers, [])).toEqual([
      { tier: "website", priceCents: 0, status: "included" },
      { tier: "rsvp", priceCents: 4900, status: "available" },
      { tier: "invitations", priceCents: 13900, status: "available" },
      { tier: "complete", priceCents: 14900, status: "available" },
    ]);
  });

  it("shows a tier without a product as coming soon", () => {
    expect(pricingTable([{ tier: "complete", priceCents: 14900, productId: null }], []).at(-1)).toEqual({ tier: "complete", priceCents: 14900, status: "comingSoon" });
  });
});
