import { LockedError, NotFoundError } from "@/application/errors";
import type { ExportFormat } from "@/application/cards";
import { container } from "@/composition/container";
import { cardKindFromSlug } from "@/domain/cards";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const FORMATS: readonly ExportFormat[] = ["png", "a6", "a5"];

/** The card as PNG or as a printable PDF (A6, A5). Without the card's package it leads to the prices. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id, kind: slug } = await params;
  const kind = cardKindFromSlug(slug);
  const format = FORMATS.find((f) => f === new URL(request.url).searchParams.get("format"));
  if (!kind || !format) return new Response(null, { status: 404 });
  try {
    const file = await container().exportCard.execute(user.id, id, kind, format);
    return new Response(Buffer.from(file.bytes), {
      headers: { "content-type": file.contentType, "content-disposition": `attachment; filename="${file.filename}"`, "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof LockedError) return Response.redirect(new URL("/preise", container().appUrl), 303);
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    throw error;
  }
}
