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
  userId: null,
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

  it("charges an upgrade only the difference: what the wedding paid counts as credit", async () => {
    expect((f.payments as FakePayments).checkouts).toEqual([]);
    await new StartCheckout(f.deps).execute(anna, weddingId, "rsvp");
    expect((f.payments as FakePayments).checkouts[0]!.priceCents).toBeUndefined();
    await webhook(paid());
    await new StartCheckout(f.deps).execute(anna, weddingId, "complete");
    expect((f.payments as FakePayments).checkouts[1]).toEqual(expect.objectContaining({ productId: "prod_all", tier: "complete", priceCents: 10000 }));
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

  it("refuses an editor and passes the buyer's id to the provider for an admin", async () => {
    const carla = await f.users.create("carla@example.org");
    await f.weddings.addMember(weddingId, carla.id, "editor");
    await expect(new StartCheckout(f.deps).execute(carla, weddingId, "rsvp")).rejects.toBeInstanceOf(NotFoundError);
    expect((f.payments as FakePayments).checkouts).toEqual([]);
    await new StartCheckout(f.deps).execute(anna, weddingId, "rsvp");
    expect((f.payments as FakePayments).checkouts[0]).toEqual(expect.objectContaining({ userId: anna.id }));
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

  it("stores who bought it when the event carries the buyer, and null otherwise", async () => {
    await webhook(paid({ userId: anna.id }));
    await webhook(paid({ eventId: "evt_2", purchaseRef: "ord_2", userId: null }));
    expect((await f.billingRepo.listByWedding(weddingId)).map((e) => e.purchasedBy)).toEqual([anna.id, null]);
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
    expect(await new ListWeddingPlans(f.deps).execute(anna.id)).toEqual([
      {
        weddingId,
        title: "Anna & Ben",
        tier: "website",
        sellable: ["rsvp", "complete"],
        prices: { rsvp: { dueCents: 4900, creditCents: 0 }, complete: { dueCents: 14900, creditCents: 0 } },
      },
    ]);
    await webhook(paid());
    expect(await new ListWeddingPlans(f.deps).execute(anna.id)).toEqual([
      { weddingId, title: "Anna & Ben", tier: "rsvp", sellable: ["complete"], prices: { complete: { dueCents: 10000, creditCents: 4900 } } },
    ]);
  });

  it("lists a user's purchases", async () => {
    await webhook(paid());
    expect(await new ListPurchases(f.deps).execute(anna.id)).toEqual([
      expect.objectContaining({ weddingId, weddingTitle: "Anna & Ben", tier: "rsvp", active: true }),
    ]);
    f.deps.billing.enabled = false;
    expect(await new ListPurchases(f.deps).execute(anna.id)).toEqual([]);
  });

  it("shows an admin the packages another admin bought, with who bought them", async () => {
    const ben = await f.users.create("ben@example.org");
    await f.weddings.addMember(weddingId, ben.id, "admin");
    await webhook(paid({ userId: anna.id }));
    await f.users.updateFirstName(anna.id, "Anna");
    const purchases = await new ListPurchases(f.deps).execute(ben.id);
    expect(purchases).toEqual([expect.objectContaining({ weddingId, tier: "rsvp", purchasedBy: { id: anna.id, name: "Anna" } })]);
    await f.users.updateFirstName(anna.id, "");
    expect((await new ListPurchases(f.deps).execute(ben.id))[0]?.purchasedBy).toEqual({ id: anna.id, name: "anna@example.org" });
  });

  it("has no buyer for purchases without one or whose buyer is gone", async () => {
    await webhook(paid());
    await webhook(paid({ eventId: "evt_2", purchaseRef: "ord_2", userId: "00000000-0000-0000-0000-000000000000" }));
    expect((await new ListPurchases(f.deps).execute(anna.id)).map((p) => p.purchasedBy)).toEqual([null, null]);
  });

  it("keeps wedding plans and purchases from editors", async () => {
    const carla = await f.users.create("carla@example.org");
    await f.weddings.addMember(weddingId, carla.id, "editor");
    await webhook(paid({ userId: anna.id }));
    expect(await new ListWeddingPlans(f.deps).execute(carla.id)).toEqual([]);
    expect(await new ListPurchases(f.deps).execute(carla.id)).toEqual([]);
  });
});
