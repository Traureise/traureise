import { LockedError, NotFoundError, ValidationError } from "@/application/errors";
import type { ExportFormat } from "@/application/cards";
import { container } from "@/composition/container";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const FORMATS: readonly ExportFormat[] = ["png", "a6", "a5"];

/** The card as PNG or as a printable PDF (A6, A5). Without the card's package it leads to the prices. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; cardId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { cardId } = await params;
  const format = FORMATS.find((f) => f === new URL(request.url).searchParams.get("format"));
  if (!format) return new Response(null, { status: 404 });
  try {
    const file = await container().exportCard.execute(user.id, cardId, format);
    return new Response(Buffer.from(file.bytes), {
      headers: { "content-type": file.contentType, "content-disposition": `attachment; filename="${file.filename}"`, "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof LockedError) return Response.redirect(new URL("/preise", container().appUrl), 303);
    if (error instanceof NotFoundError || error instanceof ValidationError) return new Response(null, { status: 404 });
    throw error;
  }
}
