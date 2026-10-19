import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { CardList } from "@/components/cards/household-letters";
import { Letter } from "@/components/cards/letter";
import { GuestSite } from "@/components/guests/guest-site";
import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

const load = cache((slug: string, version?: string) => container().getEngagementPage.execute(slug, version));

type Props = { params: Promise<{ slug: string; version?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, version } = await params;
  const page = await load(slug, version);
  const t = await getTranslations("letter");
  return { title: page ? { absolute: t("engagementTitle", { title: page.website.title }) } : undefined, robots: { index: false, follow: false } };
}

/**
 * The engagement announcement: one shareable link for everyone, opened like a letter with a general greeting.
 * The first version is at /<slug>/verlobung, others at /<slug>/verlobung/<version>.
 */
export default async function EngagementPage({ params }: Props) {
  const { slug, version } = await params;
  const page = await load(slug, version);
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
