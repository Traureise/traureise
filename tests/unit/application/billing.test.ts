import { beforeEach, describe, expect, it } from "vitest";
import { GetPricing, HandlePaymentWebhook, ListPurchases, ListWeddingPlans, StartCheckout } from "@/application/billing";
import { InvalidSignatureError, NotFoundError, ValidationError } from "@/application/errors";
import type { PaymentEvent } from "@/application/ports";
import { CreateWedding } from "@/application/weddings";
import { FakePayments, createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: { id: string; email: string };
let weddingId: string;

beforeEach(async () => {
  f = createFakes();
  anna = await f.users.create("anna@example.org");
  weddingId = (await new CreateWedding(f.deps).execute(anna.id, { title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12" })).id;
});

const webhook = (event: PaymentEvent, signature = FakePayments.SIGNATURE) =>
  new HandlePaymentWebhook(f.deps).execute(JSON.stringify(event), signature);
const paid = (over: Partial<Extract<PaymentEvent, { type: "paid" }>> = {}): PaymentEvent => ({
  type: "paid",
  eventId: "evt_1",
  purchaseRef: "ord_1",
  productId: "prod_rsvp",
  weddingId,
  ...over,
});

describe("StartCheckout", () => {
  it("creates a checkout for a sellable tier of the user's website", async () => {
    const { url } = await new StartCheckout(f.deps).execute(anna, weddingId, "rsvp");
    expect(url).toMatch(/^https:\/\/pay\.example\.org\/checkout\//);
    expect((f.payments as FakePayments).checkouts).toEqual([
      expect.objectContaining({
        productId: "prod_rsvp",
        weddingId,
        tier: "rsvp",
        customerEmail: "anna@example.org",
        successUrl: `http://localhost:3000/hochzeiten/${weddingId}?kauf=danke`,
      }),
    ]);
  });

  it("refuses tiers without a product, unknown or already owned", async () => {
    const checkout = new StartCheckout(f.deps);
    await expect(checkout.execute(anna, weddingId, "invitations")).rejects.toMatchObject({ fieldErrors: { tier: "not_available" } });
    await expect(checkout.execute(anna, weddingId, "website" as never)).rejects.toBeInstanceOf(ValidationError);
    await webhook(paid());
    await expect(checkout.execute(anna, weddingId, "rsvp")).rejects.toMatchObject({ fieldErrors: { tier: "not_available" } });
    await expect(checkout.execute(anna, weddingId, "complete")).resolves.toBeDefined();
  });

  it("refuses someone else's website", async () => {
    const ben = await f.users.create("ben@example.org");
    await expect(new StartCheckout(f.deps).execute(ben, weddingId, "rsvp")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does nothing when billing is off", async () => {
    f.deps.billing.enabled = false;
    await expect(new StartCheckout(f.deps).execute(anna, weddingId, "rsvp")).rejects.toBeInstanceOf(NotFoundError);
    expect((f.payments as FakePayments).checkouts).toEqual([]);
  });
});

describe("HandlePaymentWebhook", () => {
  it("rejects invalid signatures", async () => {
    await expect(webhook(paid(), "forged")).rejects.toBeInstanceOf(InvalidSignatureError);
    expect(f.billingRepo.entitlements).toEqual([]);
  });

  it("is not available when billing is off", async () => {
    f.deps.billing.enabled = false;
    await expect(webhook(paid())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("grants the paid tier until 12 months after the wedding", async () => {
    expect(await webhook(paid())).toBe("applied");
    expect(await f.billingRepo.listByWedding(weddingId)).toEqual([
      expect.objectContaining({ tier: "rsvp", purchaseRef: "ord_1", provider: "testpay", validUntil: new Date("2028-06-13T00:00:00Z"), revokedAt: null }),
    ]);
  });

  it("takes the tier from the product, not from anything the buyer controls", async () => {
    await webhook(paid({ productId: "prod_all" }));
    expect((await f.billingRepo.listByWedding(weddingId))[0]?.tier).toBe("complete");
  });

  it("ignores replayed events", async () => {
    await webhook(paid());
    expect(await webhook(paid())).toBe("duplicate");
    expect(f.billingRepo.entitlements).toHaveLength(1);
  });

  it("revokes on refund or chargeback, and a later replay of the payment does not grant again", async () => {
    await webhook(paid());
    await webhook({ type: "revoked", eventId: "evt_2", purchaseRef: "ord_1" });
    const [entitlement] = await f.billingRepo.listByWedding(weddingId);
    expect(entitlement?.revokedAt).toEqual(f.clock.now());
    await webhook(paid({ eventId: "evt_3" }));
    expect((await f.billingRepo.listByWedding(weddingId)).map((e) => e.revokedAt)).toEqual([f.clock.now()]);
  });

  it("acknowledges events it cannot apply", async () => {
    expect(await webhook(paid({ weddingId: "00000000-0000-0000-0000-000000000000" }))).toBe("applied");
    expect(await webhook(paid({ eventId: "evt_2", productId: "prod_unknown" }))).toBe("applied");
    expect(await webhook(paid({ eventId: "evt_3", weddingId: null }))).toBe("applied");
    expect(await webhook({ type: "revoked", eventId: "evt_4", purchaseRef: "ord_unknown" })).toBe("applied");
    expect(await webhook({ type: "ignored", eventId: "evt_5" })).toBe("applied");
    expect(f.billingRepo.entitlements).toEqual([]);
  });
});

describe("pricing and plans", () => {
  it("shows the pricing table only when billing is on", async () => {
    expect(new GetPricing(f.deps).execute()?.map((r) => r.status)).toEqual(["included", "available", "comingSoon", "available"]);
    f.deps.billing.enabled = false;
    expect(new GetPricing(f.deps).execute()).toBeNull();
  });

  it("lists each website's current tier and what it can buy", async () => {
    expect(await new ListWeddingPlans(f.deps).execute(anna.id)).toEqual([{ weddingId, title: "Anna & Ben", tier: "website", sellable: ["rsvp", "complete"] }]);
    await webhook(paid());
    expect(await new ListWeddingPlans(f.deps).execute(anna.id)).toEqual([{ weddingId, title: "Anna & Ben", tier: "rsvp", sellable: ["complete"] }]);
  });

  it("lists a user's purchases", async () => {
    await webhook(paid());
    expect(await new ListPurchases(f.deps).execute(anna.id)).toEqual([
      expect.objectContaining({ weddingId, weddingTitle: "Anna & Ben", tier: "rsvp", active: true }),
    ]);
    f.deps.billing.enabled = false;
    expect(await new ListPurchases(f.deps).execute(anna.id)).toEqual([]);
  });
});
