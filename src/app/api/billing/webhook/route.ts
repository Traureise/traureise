import { InvalidSignatureError, NotFoundError } from "@/application/errors";
import { container } from "@/composition/container";

/** Payment-provider webhooks. The raw body is needed to check the signature. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const outcome = await container().handlePaymentWebhook.execute(rawBody, request.headers.get("creem-signature"));
    return Response.json({ ok: true, outcome });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    if (error instanceof InvalidSignatureError) return new Response(null, { status: 401 });
    console.error(error);
    return new Response(null, { status: 500 });
  }
}
