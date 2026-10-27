import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarHeart } from "lucide-react";
import { NotFoundError } from "@/application/errors";
import { Badge } from "@/components/ui/badge";
import { MarkWeddingUsed } from "@/components/weddings/mark-used";
import { Timeline } from "@/components/weddings/timeline";
import { container } from "@/composition/container";
import { dateFromIso } from "@/lib/format";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ kauf?: string }> };

async function load(id: string) {
  const user = await requireProfile();
  try {
    return await container().getWeddingHome.execute(user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const home = await load((await params).id);
  return { title: home.wedding.title };
}

/** The Vorbereitung tab, a wedding's home: the welcome, the countdown and the timeline of its items. */
export default async function WeddingHomePage({ params, searchParams }: Props) {
  const home = await load((await params).id);
  const { kauf } = await searchParams;
  const t = await getTranslations("weddings.home");
  const tDetails = await getTranslations("weddings.details");
  const tTiers = await getTranslations("pricing.tiers");
  const format = await getFormatter();
  const { wedding } = home;
  const date = wedding.weddingDate ? format.dateTime(dateFromIso(wedding.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : null;
  const badge = [home.countdown !== null && home.countdown >= 0 ? t("countdown", { days: home.countdown }) : null, date ?? t("dateOpen"), wedding.location].filter(Boolean).join(" · ");
  return (
    <div className="space-y-8">
      {kauf === "danke" && (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm" data-testid="purchase-thanks">
          {t("purchaseThanks")}
        </p>
      )}
      <header className="space-y-3">
        <h1 className="font-heading text-4xl font-medium tracking-tight text-balance sm:text-5xl">{t("welcome", { names: wedding.title })}</h1>
        <p className="text-muted-foreground">{t("wish")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="h-auto gap-1.5 rounded-full px-3 py-1 text-sm whitespace-normal" data-testid="wedding-badge">
            <CalendarHeart aria-hidden />
            {badge}
          </Badge>
          <Link href={`/hochzeiten/${wedding.id}/hochzeit`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            {tDetails("open")}
          </Link>
          {/* Packages are the admins' business. */}
          {home.tier && wedding.role === "admin" && (
            <span className="text-sm text-muted-foreground" data-testid="wedding-plan">
              · {t("plan", { tier: tTiers(`${home.tier}.name`) })}
              {home.tier !== "complete" && (
                <>
                  {" "}
                  <Link href="/preise" className="text-primary underline-offset-4 hover:underline">
                    {t("upgrade")}
                  </Link>
                </>
              )}
            </span>
          )}
        </div>
      </header>

      <MarkWeddingUsed weddingId={wedding.id} />
      <Timeline home={home} />
    </div>
  );
}
