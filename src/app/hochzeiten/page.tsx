import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { PageShell } from "@/components/app/app-footer";
import { Button } from "@/components/ui/button";
import { DeleteWeddingButton } from "@/components/weddings/delete-wedding-button";
import { container } from "@/composition/container";
import { dateFromIso } from "@/lib/format";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("weddings"))("listTitle") };
}

/** Every wedding of the account, for planners or for helping a friend. */
export default async function WeddingsPage() {
  const user = await requireProfile();
  const t = await getTranslations("weddings");
  const format = await getFormatter();
  const weddings = await container().listWeddings.execute(user.id);
  return (
    <PageShell header={<AppHeader email={user.email} />}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-heading text-5xl font-medium tracking-tight">{t("listTitle")}</h1>
            <p className="text-muted-foreground">{t("listLead")}</p>
          </div>
          <Button asChild size="lg">
            <Link href="/hochzeiten/neu">
              <Plus aria-hidden />
              {t("new")}
            </Link>
          </Button>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="wedding-list">
          {weddings.map((w) => (
            <li key={w.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" data-testid="wedding">
              <div className="space-y-2">
                <h2 className="font-heading text-3xl font-medium tracking-tight">
                  <Link href={`/hochzeiten/${w.id}`} className="hover:underline">
                    {w.title}
                  </Link>
                </h2>
                <p className="flex items-center gap-2 text-sm">
                  <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                  {w.weddingDate ? format.dateTime(dateFromIso(w.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : t("dateOpen")}
                </p>
                {w.location && (
                  <p className="flex items-center gap-2 text-sm">
                    <MapPin className="size-4 text-muted-foreground" aria-hidden />
                    {w.location}
                  </p>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <Button asChild>
                  <Link href={`/hochzeiten/${w.id}`}>{t("open")}</Link>
                </Button>
                <DeleteWeddingButton weddingId={w.id} title={w.title} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </PageShell>
  );
}
