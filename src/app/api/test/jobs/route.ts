import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

/** Testing only (TEST_HOOKS=true): runs the guest jobs now for one wedding (`{ "weddingId": "…" }`). */
export async function POST(request: Request) {
  if (!container().testHooks) return new Response(null, { status: 404 });
  const { weddingId } = (await request.json()) as { weddingId?: string };
  if (!weddingId) return Response.json({ error: "weddingId is required" }, { status: 400 });
  return Response.json(await container().runGuestJobs.execute({ weddingId }));
}
