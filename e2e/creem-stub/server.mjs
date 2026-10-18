// A stand-in for the Creem API in E2E tests, so tests never reach the real payment provider.
// It implements the checkout endpoint, a hosted test checkout page and signed webhooks shaped like
// Creem's (envelope: id, eventType, created_at, object; header creem-signature = hex HMAC-SHA256).
// Test-only endpoints under /test/ replay and refund past checkouts.
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const { PORT = "4010", PUBLIC_URL = `http://localhost:${PORT}`, API_KEY, WEBHOOK_SECRET, WEBHOOK_URL } = process.env;
if (!API_KEY || !WEBHOOK_SECRET || !WEBHOOK_URL) throw new Error("API_KEY, WEBHOOK_SECRET and WEBHOOK_URL are required");

const checkouts = new Map();
let counter = 0;
const nextId = (prefix) => `${prefix}_e2e${Date.now().toString(36)}${(++counter).toString(36)}`;

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** Sends a webhook to the app exactly as Creem would and returns the app's answer. */
async function deliver(body) {
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "creem-signature": signature }, body });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function completedEvent(checkout) {
  return JSON.stringify({
    id: nextId("evt"),
    eventType: "checkout.completed",
    created_at: Date.now(),
    object: {
      id: checkout.id,
      object: "checkout",
      request_id: checkout.request_id,
      order: { id: checkout.orderId, customer: "cust_e2e", product: checkout.product_id, amount: 4900, currency: "EUR", status: "paid", type: "onetime" },
      product: { id: checkout.product_id, name: "Test product", billing_type: "onetime" },
      customer: { id: "cust_e2e", object: "customer", email: checkout.customer?.email ?? null },
      status: "completed",
      metadata: checkout.metadata ?? {},
      mode: "test",
    },
  });
}

function refundEvent(checkout) {
  return JSON.stringify({
    id: nextId("evt"),
    eventType: "refund.created",
    created_at: Date.now(),
    object: {
      id: nextId("ref"),
      object: "refund",
      status: "succeeded",
      reason: "requested_by_customer",
      transaction: { id: nextId("tran"), order: checkout.orderId },
      checkout: { id: checkout.id, request_id: checkout.request_id, metadata: checkout.metadata ?? {} },
      order: { id: checkout.orderId, status: "refunded" },
      customer: { id: "cust_e2e", email: checkout.customer?.email ?? null },
    },
  });
}

const page = (checkout) => `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Testkasse</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem}button{font-size:1rem;padding:.6rem 1.2rem}</style></head>
<body><h1>Testkasse</h1><p>Produkt: <code>${checkout.product_id}</code></p>
<form method="post" action="/checkout/${checkout.id}/pay"><button type="submit">Bezahlen</button></form></body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

    if (req.method === "POST" && url.pathname === "/v1/checkouts") {
      if (req.headers["x-api-key"] !== API_KEY) return json(res, 401, { error: "invalid api key" });
      const input = JSON.parse(await readBody(req));
      if (!input.product_id) return json(res, 400, { error: "product_id is required" });
      const checkout = { ...input, id: nextId("ch"), orderId: null, completedBody: null };
      checkouts.set(checkout.id, checkout);
      return json(res, 200, {
        id: checkout.id,
        object: "checkout",
        status: "pending",
        product: checkout.product_id,
        request_id: checkout.request_id,
        metadata: checkout.metadata,
        success_url: checkout.success_url,
        checkout_url: `${PUBLIC_URL}/checkout/${checkout.id}`,
        mode: "test",
      });
    }

    const checkout = checkouts.get(parts[0] === "test" ? parts[2] : parts[1]);

    if (req.method === "GET" && parts[0] === "checkout" && checkout) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(page(checkout));
    }

    if (req.method === "POST" && parts[0] === "checkout" && parts[2] === "pay" && checkout) {
      checkout.orderId ??= nextId("ord");
      checkout.completedBody ??= completedEvent(checkout);
      checkout.lastDelivery = await deliver(checkout.completedBody);
      const target = new URL(checkout.success_url);
      target.searchParams.set("checkout_id", checkout.id);
      target.searchParams.set("order_id", checkout.orderId);
      res.writeHead(303, { location: target.toString() });
      return res.end();
    }

    // Test-only controls.
    if (req.method === "GET" && url.pathname === "/test/checkouts/latest") {
      const latest = [...checkouts.values()].at(-1);
      return latest ? json(res, 200, latest) : json(res, 404, { error: "no checkouts" });
    }
    if (req.method === "POST" && parts[0] === "test" && parts[1] === "checkouts" && checkout?.completedBody) {
      if (parts[3] === "replay") return json(res, 200, await deliver(checkout.completedBody));
      if (parts[3] === "refund") return json(res, 200, await deliver(refundEvent(checkout)));
    }
    return json(res, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: String(error) });
  }
});

server.listen(Number(PORT), () => console.log(`creem stub listening on ${PORT}`));
