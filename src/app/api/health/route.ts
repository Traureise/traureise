import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

export async function GET() {
  const ok = await container().healthCheck();
  return Response.json({ ok }, { status: ok ? 200 : 503 });
}
