import { describe, expect, it } from "vitest";
import type { Entitlement } from "@/domain/billing";
import { guestDataDeletionDate, guestLinksActive, retentionWarningDue } from "@/domain/retention";

const now = new Date("2026-10-18T10:00:00Z");
const entitlement = (over: Partial<Entitlement> = {}): Entitlement => ({
  tier: "rsvp",
  purchaseRef: "ord_1",
  validUntil: new Date("2028-06-13T00:00:00Z"),
  revokedAt: null,
  ...over,
});

describe("guestDataDeletionDate", () => {
  it("is the end of the day 12 months after the wedding", () => {
    expect(guestDataDeletionDate({ weddingDate: "2027-06-12", entitlements: [] })?.toISOString()).toBe("2028-06-13T00:00:00.000Z");
  });

  it("is never without a wedding date or a package", () => {
    expect(guestDataDeletionDate({ weddingDate: null, entitlements: [] })).toBeNull();
  });

  it("follows the RSVP package, even a refunded one, when it ends later", () => {
    const bought = entitlement({ validUntil: new Date("2027-10-19T00:00:00Z") });
    expect(guestDataDeletionDate({ weddingDate: null, entitlements: [bought] })).toEqual(bought.validUntil);
    const refunded = entitlement({ validUntil: new Date("2029-01-01T00:00:00Z"), revokedAt: now });
    expect(guestDataDeletionDate({ weddingDate: "2027-06-12", entitlements: [refunded] })).toEqual(refunded.validUntil);
  });

  it("ignores packages below RSVP and takes the latest of several", () => {
    const later = entitlement({ tier: "complete", purchaseRef: "ord_2", validUntil: new Date("2029-02-01T00:00:00Z") });
    expect(guestDataDeletionDate({ weddingDate: "2027-06-12", entitlements: [entitlement(), later] })).toEqual(later.validUntil);
  });
});

describe("guestLinksActive", () => {
  const off = { billingEnabled: false, entitlements: [] };
  it("is on without billing until the guest data is deleted", () => {
    expect(guestLinksActive(off, "2027-06-12", now)).toBe(true);
    expect(guestLinksActive(off, "2025-06-12", now)).toBe(false);
    expect(guestLinksActive(off, null, now)).toBe(true);
  });

  it("needs an active RSVP package with billing", () => {
    expect(guestLinksActive({ billingEnabled: true, entitlements: [] }, "2027-06-12", now)).toBe(false);
    expect(guestLinksActive({ billingEnabled: true, entitlements: [entitlement()] }, "2027-06-12", now)).toBe(true);
    expect(guestLinksActive({ billingEnabled: true, entitlements: [entitlement({ revokedAt: now })] }, "2027-06-12", now)).toBe(false);
  });
});

describe("retentionWarningDue", () => {
  const deleteAt = new Date("2026-11-17T00:00:00Z");
  it("starts 30 days before the deletion", () => {
    expect(retentionWarningDue(deleteAt, new Date("2026-10-17T23:59:59Z"))).toBe(false);
    expect(retentionWarningDue(deleteAt, new Date("2026-10-18T00:00:00Z"))).toBe(true);
    expect(retentionWarningDue(null, now)).toBe(false);
  });
});
