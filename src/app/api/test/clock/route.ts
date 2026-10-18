import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

/** Testing only (TEST_HOOKS=true): `{ "offsetDays": 400 }` moves the app's clock; `0` resets it. */
export async function POST(request: Request) {
  const hooks = container().testHooks;
  if (!hooks) return new Response(null, { status: 404 });
  const { offsetDays } = (await request.json()) as { offsetDays?: number };
  if (typeof offsetDays !== "number" || !Number.isFinite(offsetDays)) return Response.json({ error: "offsetDays must be a number" }, { status: 400 });
  hooks.setClockOffset(offsetDays * 86_400_000);
  return Response.json({ now: container().clock.now().toISOString() });
}
