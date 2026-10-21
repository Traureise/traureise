import { getTranslations } from "next-intl/server";
import { NotFoundError } from "@/application/errors";
import { container } from "@/composition/container";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Every person with their answers as CSV (for the venue, seating and so on). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const t = await getTranslations("guests.csv");
  try {
    const { filename, csv } = await container().exportGuestsCsv.execute(user.id, (await params).id, {
      household: t("household"),
      name: t("name"),
      child: t("child"),
      status: t("status"),
      meal: t("meal"),
      allergies: t("allergies"),
      message: t("message"),
      yes: t("yes"),
      no: t("no"),
      statuses: { coming: t("coming"), notComing: t("notComing"), open: t("open") },
    });
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    throw error;
  }
}
