import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

/** Testing only (TEST_HOOKS=true): runs the guest jobs now for one website (`{ "websiteId": "…" }`). */
export async function POST(request: Request) {
  if (!container().testHooks) return new Response(null, { status: 404 });
  const { websiteId } = (await request.json()) as { websiteId?: string };
  if (!websiteId) return Response.json({ error: "websiteId is required" }, { status: 400 });
  return Response.json(await container().runGuestJobs.execute({ websiteId }));
}
