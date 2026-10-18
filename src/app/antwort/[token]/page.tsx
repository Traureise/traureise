import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { CardList } from "@/components/cards/household-letters";
import { Letter } from "@/components/cards/letter";
import { GuestForm } from "@/components/guests/guest-form";
import { GuestSite } from "@/components/guests/guest-site";
import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

const load = cache((token: string) => container().getHouseholdPage.execute(token));

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await load((await params).token);
  const t = await getTranslations("rsvp");
  // The token is personal: no index, and no Referer when a guest follows a link from here.
  return { title: view ? { absolute: t("pageTitle", { title: view.website.title }) } : undefined, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** The household's page: everything the couple sent it (newest first), with the response form under the invitation. */
export default async function HouseholdPage({ params }: Props) {
  const { token } = await params;
  const view = await load(token);
  if (!view) notFound();
  const t = await getTranslations("rsvp");
  if (view.state !== "page") {
    return (
      <GuestSite design={view.design}>
        <section className="mx-auto max-w-xl space-y-4 px-6 py-24 text-center" data-testid="guest-link-inactive">
          <p className="site-eyebrow">{view.website.title}</p>
          <h1 className="text-4xl">{t("inactiveTitle")}</h1>
          <p className="site-muted">{t("inactiveBody")}</p>
        </section>
      </GuestSite>
    );
  }
  const form = view.form && <GuestForm form={view.form} token={token} />;
  if (view.cards.length === 0) return <GuestSite design={view.design}>{form}</GuestSite>;
  return (
    <GuestSite design={view.design}>
      <Letter envelope={view.envelope} greeting={view.greeting} openedUrl={`/api/antwort/${token}/geoeffnet`} kinds={view.cards.map((c) => c.kind)}>
        <CardList cards={view.cards} formAnchor={view.form ? "antwort" : null} />
        {form && (
          <div id="antwort" className="scroll-mt-6">
            {form}
          </div>
        )}
      </Letter>
    </GuestSite>
  );
}
