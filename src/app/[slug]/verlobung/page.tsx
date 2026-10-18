import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { CardList } from "@/components/cards/household-letters";
import { Letter } from "@/components/cards/letter";
import { GuestSite } from "@/components/guests/guest-site";
import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

const load = cache((slug: string) => container().getEngagementPage.execute(slug));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  const t = await getTranslations("letter");
  return { title: page ? { absolute: t("engagementTitle", { title: page.website.title }) } : undefined, robots: { index: false, follow: false } };
}

/** The engagement announcement: one shareable link for everyone, opened like a letter with a general greeting. */
export default async function EngagementPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  const t = await getTranslations("letter");
  if (page.state === "inactive") {
    return (
      <GuestSite design={page.design}>
        <section className="mx-auto max-w-xl space-y-4 px-6 py-24 text-center" data-testid="engagement-inactive">
          <p className="site-eyebrow">{page.website.title}</p>
          <h1 className="text-4xl">{t("inactiveTitle")}</h1>
          <p className="site-muted">{t("inactiveBody")}</p>
        </section>
      </GuestSite>
    );
  }
  return (
    <GuestSite design={page.design}>
      <Letter envelope={page.card.envelope} greeting={null} openedUrl={null} kinds={[]}>
        <CardList cards={[page.card]} formAnchor={null} />
      </Letter>
    </GuestSite>
  );
}
