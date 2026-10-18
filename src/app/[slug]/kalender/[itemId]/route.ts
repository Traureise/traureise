import { container } from "@/composition/container";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { slug, itemId } = await params;
  const ics = await container().getEventIcs.execute(slug, itemId);
  if (!ics) return new Response(null, { status: 404 });
  return new Response(ics.content, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ics.filename}"`,
    },
  });
}
