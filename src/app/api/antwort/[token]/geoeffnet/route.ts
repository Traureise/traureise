import { container } from "@/composition/container";

/**
 * The household's page reports which cards it showed once the envelope is open: the "opened" status.
 * Same origin, the household's own link, no pixel. Link previews and mail scanners never run this.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const body = (await request.json().catch(() => null)) as { kinds?: unknown } | null;
  const kinds = Array.isArray(body?.kinds) ? body.kinds.filter((k): k is string => typeof k === "string").slice(0, 4) : [];
  await container().markCardsOpened.execute((await params).token, kinds);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
