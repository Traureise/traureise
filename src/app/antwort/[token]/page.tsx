import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { GuestForm } from "@/components/guests/guest-form";
import { GuestSite } from "@/components/guests/guest-site";
import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

const load = cache((token: string) => container().getGuestForm.execute(token));

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const form = await load((await params).token);
  const t = await getTranslations("rsvp");
  // The token is personal: no index, and no Referer when a guest follows a link from here.
  return { title: form ? { absolute: t("pageTitle", { title: form.website.title }) } : undefined, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function GuestAnswerPage({ params }: Props) {
  const { token } = await params;
  const form = await load(token);
  if (!form) notFound();
  const t = await getTranslations("rsvp");
  if (form.state === "inactive") {
    return (
      <GuestSite design={form.design}>
        <section className="mx-auto max-w-xl space-y-4 px-6 py-24 text-center" data-testid="guest-link-inactive">
          <p className="site-eyebrow">{form.website.title}</p>
          <h1 className="text-4xl">{t("inactiveTitle")}</h1>
          <p className="site-muted">{t("inactiveBody")}</p>
        </section>
      </GuestSite>
    );
  }
  return (
    <GuestSite design={form.design}>
      <GuestForm form={form} token={token} />
    </GuestSite>
  );
}
