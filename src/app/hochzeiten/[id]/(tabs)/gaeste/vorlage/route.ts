import { NotFoundError } from "@/application/errors";
import { container } from "@/composition/container";
import { importHeaders } from "@/lib/import-headers";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The spreadsheet to fill in for importing guests: one column per field and one per event. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  try {
    const { filename, bytes } = await container().downloadGuestTemplate.execute(user.id, (await params).id, await importHeaders());
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    throw error;
  }
}
