import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter } from "next-intl/server";
import { cache } from "react";
import { WeddingSite } from "@/components/site/wedding-site";
import { container } from "@/composition/container";
import { dateFromIso, uploadUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

const load = cache((slug: string) => container().getPublicWebsite.execute(slug));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await load((await params).slug);
  if (!view) return {};
  const { website } = view;
  const format = await getFormatter();
  const date = website.weddingDate ? format.dateTime(dateFromIso(website.weddingDate), { dateStyle: "long", timeZone: "UTC" }) : null;
  const description = [date, website.location].filter(Boolean).join(" · ") || website.welcomeMessage.slice(0, 160);
  const appUrl = container().appUrl;
  return {
    title: { absolute: website.title },
    description,
    // Guests get the link from the couple; search engines do not need it.
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title: website.title,
      description,
      url: `${appUrl}/${website.slug}`,
      locale: "de_DE",
      images: website.coverImageKey ? [{ url: `${appUrl}${uploadUrl(website.coverImageKey)}` }] : undefined,
    },
  };
}

export default async function PublicWebsitePage({ params }: Props) {
  const view = await load((await params).slug);
  if (!view) notFound();
  return <WeddingSite view={view} now={new Date()} mode="public" />;
}
