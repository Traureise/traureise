import "server-only";
import { getTranslations } from "next-intl/server";
import type { ImportHeaders } from "@/domain/guest-import";

/** The column headers of the guest import, in the couple's language; the template and the reader must agree. */
export async function importHeaders(): Promise<ImportHeaders> {
  const t = await getTranslations("guests.import.columns");
  return { name: t("name"), household: t("household"), child: t("child"), email: t("email"), allergies: t("allergies"), personalLine: t("personalLine") };
}
