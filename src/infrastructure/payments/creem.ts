import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { CheckoutRequest, PaymentEvent, PaymentProvider } from "@/application/ports";

export type CreemOptions = { apiUrl: string; apiKey: string; webhookSecret: string; fetch?: typeof fetch };

const ref = z.object({ id: z.string() }).partial().passthrough();
const event = z.object({
  id: z.string().min(1),
  eventType: z.string(),
  object: z
    .object({
      order: ref.optional(),
      product: ref.optional(),
      transaction: z.object({ order: z.string().optional() }).passthrough().optional(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
    })
    .passthrough(),
});

/** Creem (Armitage Labs OÜ, Estonia) is the merchant of record: it sells, invoices and handles VAT. */
export class CreemPaymentProvider implements PaymentProvider {
  readonly name = "Creem";

  constructor(private options: CreemOptions) {}

  async createCheckout(request: CheckoutRequest): Promise<{ url: string }> {
    const fetchImpl = this.options.fetch ?? fetch;
    const res = await fetchImpl(`${this.options.apiUrl.replace(/\/$/, "")}/v1/checkouts`, {
      method: "POST",
      headers: { "x-api-key": this.options.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        product_id: request.productId,
        request_id: request.requestId,
        success_url: request.successUrl,
        customer: { email: request.customerEmail },
        metadata: { weddingId: request.weddingId, userId: request.userId, tier: request.tier },
        // An upgrade: Creem's per-checkout price override for one-time products, in cents.
        ...(request.priceCents === undefined ? {} : { custom_price: request.priceCents }),
      }),
    });
    if (!res.ok) throw new Error(`Creem checkout failed: ${res.status}`);
    const { checkout_url } = z.object({ checkout_url: z.url() }).parse(await res.json());
    return { url: checkout_url };
  }

  parseWebhook(rawBody: string, signature: string | null): PaymentEvent | null {
    if (!signature || !this.validSignature(rawBody, signature)) return null;
    let parsed;
    try {
      parsed = event.safeParse(JSON.parse(rawBody));
    } catch {
      return null;
    }
    if (!parsed.success) return null;
    const { id: eventId, eventType, object } = parsed.data;
    const orderId = object.order?.id ?? object.transaction?.order ?? null;

    switch (eventType) {
      case "checkout.completed": {
        const productId = object.product?.id;
        const { weddingId, userId } = object.metadata ?? {};
        if (!orderId || !productId) return { type: "ignored", eventId };
        const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);
        return { type: "paid", eventId, purchaseRef: orderId, productId, weddingId: strOrNull(weddingId), userId: strOrNull(userId) };
      }
      case "refund.created":
      case "dispute.created":
        return { type: "revoked", eventId, purchaseRef: orderId };
      default:
        return { type: "ignored", eventId };
    }
  }

  /** `creem-signature` is the hex HMAC-SHA256 of the raw body with the webhook secret. */
  private validSignature(rawBody: string, signature: string): boolean {
    const expected = createHmac("sha256", this.options.webhookSecret).update(rawBody).digest();
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  }
}
