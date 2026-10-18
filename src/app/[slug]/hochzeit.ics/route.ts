import { container } from "@/composition/container";

/** The wedding day as an all-day calendar event (the Save the Date's calendar button). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const ics = await container().getWeddingIcs.execute((await params).slug);
  if (!ics) return new Response(null, { status: 404 });
  return new Response(ics.content, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${ics.filename}"` },
  });
}
