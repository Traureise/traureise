import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** "Angaben ändern" from inside a card or the website editor: the Hochzeit tab, which returns here after saving. */
export async function WeddingDetailsLink({ weddingId, back, label }: { weddingId: string; back: string; label?: string }) {
  const t = await getTranslations("weddings.details");
  return (
    <Link href={`/hochzeiten/${weddingId}/hochzeit?zurueck=${encodeURIComponent(back)}`} className="font-medium text-primary underline-offset-4 hover:underline">
      {label ?? t("open")}
    </Link>
  );
}
