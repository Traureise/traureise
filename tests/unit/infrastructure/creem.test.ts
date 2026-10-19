import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CreemPaymentProvider } from "@/infrastructure/payments/creem";

const SECRET = "whsec_test";
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("hex");

function provider(fetchImpl: typeof fetch = async () => new Response("{}")) {
  return new CreemPaymentProvider({ apiUrl: "https://test-api.creem.io/", apiKey: "creem_test_key", webhookSecret: SECRET, fetch: fetchImpl });
}

// Shapes as documented by Creem (envelope: id, eventType, created_at, object).
const checkoutCompleted = {
  id: "evt_5WHHcZPv7VS0YUsberIuOz",
  eventType: "checkout.completed",
  created_at: 1728734325927,
  object: {
    id: "ch_4l0N34kxo16AhRKUHFUuXr",
    object: "checkout",
    request_id: "req_1",
    order: { id: "ord_4aDwWXjMLpes4Kj4XqNnUA", customer: "cust_1", product: "prod_rsvp", amount: 4900, currency: "EUR", status: "paid", type: "onetime" },
    product: { id: "prod_rsvp", name: "RSVP", price: 4900, currency: "EUR", billing_type: "onetime" },
    customer: { id: "cust_1", object: "customer", email: "anna@example.org", name: "Anna" },
    status: "completed",
    metadata: { weddingId: "6a1f0c62-2b0e-4b8e-9b4d-2b6a8c1f0e11", tier: "rsvp" },
    mode: "test",
  },
};
const refundCreated = {
  id: "evt_61eTsJHUgInFw2BQKhTiPV",
  eventType: "refund.created",
  created_at: 1728734351525,
  object: {
    id: "ref_3DB9NQFvk18TJwSqd0N6bd",
    object: "refund",
    status: "succeeded",
    refund_amount: 4900,
    refund_currency: "EUR",
    reason: "requested_by_customer",
    transaction: { id: "tran_1", order: "ord_4aDwWXjMLpes4Kj4XqNnUA" },
    checkout: { id: "ch_4l0N34kxo16AhRKUHFUuXr", request_id: "req_1", metadata: { weddingId: "x" } },
    order: { id: "ord_4aDwWXjMLpes4Kj4XqNnUA", status: "refunded" },
    customer: { id: "cust_1", email: "anna@example.org" },
  },
};
const disputeCreated = {
  id: "evt_6mfLDL7P0NYwYQqCrICvDH",
  eventType: "dispute.created",
  created_at: 1750941264812,
  object: { id: "disp_6vSsOdTANP5PhOzuDlUuXE", object: "dispute", amount: 4900, currency: "EUR", transaction: { id: "tran_1", order: "ord_4aDwWXjMLpes4Kj4XqNnUA" }, checkout: { id: "ch_4l0N34kxo16AhRKUHFUuXr" } },
};

describe("CreemPaymentProvider.createCheckout", () => {
  it("posts the product, buyer, metadata and success URL and returns the checkout URL", async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const creem = provider(async (url, init) => {
      request = { url: String(url), init: init! };
      return Response.json({ id: "ch_1", checkout_url: "https://checkout.creem.io/ch_1", status: "pending" });
    });
    const result = await creem.createCheckout({
      productId: "prod_rsvp",
      weddingId: "w1",
      tier: "rsvp",
      customerEmail: "anna@example.org",
      successUrl: "https://traureise.example/dashboard?kauf=danke",
      requestId: "req_1",
    });
    expect(result).toEqual({ url: "https://checkout.creem.io/ch_1" });
    expect(request!.url).toBe("https://test-api.creem.io/v1/checkouts");
    expect(request!.init.method).toBe("POST");
    expect(new Headers(request!.init.headers).get("x-api-key")).toBe("creem_test_key");
    expect(JSON.parse(String(request!.init.body))).toEqual({
      product_id: "prod_rsvp",
      request_id: "req_1",
      success_url: "https://traureise.example/dashboard?kauf=danke",
      customer: { email: "anna@example.org" },
      metadata: { weddingId: "w1", tier: "rsvp" },
    });
  });

  it("sends an upgrade's reduced price as custom_price in cents", async () => {
    let body: Record<string, unknown> = {};
    const creem = provider(async (_url, init) => {
      body = JSON.parse(String(init!.body));
      return Response.json({ id: "ch_2", checkout_url: "https://checkout.creem.io/ch_2", status: "pending" });
    });
    await creem.createCheckout({ productId: "prod_all", weddingId: "w1", tier: "complete", customerEmail: "a@b.de", successUrl: "https://x", requestId: "r", priceCents: 10000 });
    expect(body.custom_price).toBe(10000);
  });

  it("fails on API errors", async () => {
    const creem = provider(async () => new Response("nope", { status: 401 }));
    await expect(
      creem.createCheckout({ productId: "p", weddingId: "w", tier: "rsvp", customerEmail: "a@b.de", successUrl: "https://x", requestId: "r" }),
    ).rejects.toThrow(/401/);
  });
});

describe("CreemPaymentProvider.parseWebhook", () => {
  it("rejects missing or wrong signatures", () => {
    const body = JSON.stringify(checkoutCompleted);
    expect(provider().parseWebhook(body, null)).toBeNull();
    expect(provider().parseWebhook(body, sign(body, "other"))).toBeNull();
    expect(provider().parseWebhook(body, "zz")).toBeNull();
    expect(provider().parseWebhook(body + " ", sign(body))).toBeNull();
  });

  it("turns a completed checkout into a payment for the wedding in the metadata", () => {
    const body = JSON.stringify(checkoutCompleted);
    expect(provider().parseWebhook(body, sign(body))).toEqual({
      type: "paid",
      eventId: "evt_5WHHcZPv7VS0YUsberIuOz",
      purchaseRef: "ord_4aDwWXjMLpes4Kj4XqNnUA",
      productId: "prod_rsvp",
      weddingId: "6a1f0c62-2b0e-4b8e-9b4d-2b6a8c1f0e11",
    });
  });

  it("revokes on refunds and disputes, with either order reference", () => {
    for (const event of [refundCreated, disputeCreated, { ...refundCreated, object: { ...refundCreated.object, order: undefined } }]) {
      const body = JSON.stringify(event);
      expect(provider().parseWebhook(body, sign(body))).toEqual({ type: "revoked", eventId: event.id, purchaseRef: "ord_4aDwWXjMLpes4Kj4XqNnUA" });
    }
  });

  it("ignores other event types", () => {
    const body = JSON.stringify({ id: "evt_9", eventType: "subscription.paid", created_at: 1, object: {} });
    expect(provider().parseWebhook(body, sign(body))).toEqual({ type: "ignored", eventId: "evt_9" });
  });

  it("rejects signed bodies that are not events", () => {
    const body = "not json";
    expect(provider().parseWebhook(body, sign(body))).toBeNull();
  });
});
