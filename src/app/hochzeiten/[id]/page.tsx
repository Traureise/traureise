import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarHeart, Users } from "lucide-react";
import { NotFoundError } from "@/application/errors";
import { AppHeader } from "@/components/app/app-header";
import { PageShell } from "@/components/app/app-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteWeddingButton } from "@/components/weddings/delete-wedding-button";
import { MarkWeddingUsed } from "@/components/weddings/mark-used";
import { Timeline } from "@/components/weddings/timeline";
import { WeddingDetailsButton } from "@/components/weddings/wedding-details-dialog";
import { WeddingNav } from "@/components/weddings/wedding-nav";
import { WeddingSwitcher } from "@/components/weddings/wedding-switcher";
import { container } from "@/composition/container";
import { dateFromIso } from "@/lib/format";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ kauf?: string }> };

async function load(id: string) {
  const user = await requireProfile();
  try {
    return { user, home: await container().getWeddingHome.execute(user.id, id) };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { home } = await load((await params).id);
  return { title: home.wedding.title };
}

/** A wedding's home: the welcome, the countdown, the timeline of its items and the guests. */
export default async function WeddingHomePage({ params, searchParams }: Props) {
  const { user, home } = await load((await params).id);
  const { kauf } = await searchParams;
  const t = await getTranslations("weddings.home");
  const tTiers = await getTranslations("pricing.tiers");
  const format = await getFormatter();
  const { wedding } = home;
  const date = wedding.weddingDate ? format.dateTime(dateFromIso(wedding.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : null;
  const badge = [home.countdown !== null && home.countdown >= 0 ? t("countdown", { days: home.countdown }) : null, date ?? t("dateOpen"), wedding.location].filter(Boolean).join(" · ");
  const c = container();
  return (
    <PageShell header={<AppHeader email={user.email} />}>
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <WeddingNav wedding={wedding} />
          <WeddingSwitcher current={wedding.title} others={home.others} />
        </div>
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
            <WeddingDetailsButton wedding={wedding} appUrl={c.appUrl} timeZones={Intl.supportedValuesOf("timeZone")} variant="link" />
            {home.tier && (
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

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4" data-testid="guest-summary">
          <div>
            <h2 className="font-heading text-xl font-medium">{t("guests")}</h2>
            <p className="text-sm text-muted-foreground">{t("guestSummary", home.guests)}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/hochzeiten/${wedding.id}/gaeste`}>
              <Users aria-hidden />
              {t("guestList")}
            </Link>
          </Button>
        </section>

        <div className="flex justify-end">
          <DeleteWeddingButton weddingId={wedding.id} title={wedding.title} />
        </div>
      </div>
    </PageShell>
  );
}
