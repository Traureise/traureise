import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { unsubscribeAction } from "@/app/actions/cards";
import { PageShell } from "@/components/app/app-footer";
import { Button } from "@/components/ui/button";
import { container } from "@/composition/container";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("unsubscribe"))("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** The unsubscribe link in guest emails: says whose emails stop and asks for one click (scanners never click). */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await container().getUnsubscribe.execute(token);
  if (!info) notFound();
  const t = await getTranslations("unsubscribe");
  return (
    <PageShell>
      <section className="mx-auto max-w-lg space-y-5 py-10" data-testid="unsubscribe">
        <h1 className="font-heading text-4xl font-medium tracking-tight">{t("title")}</h1>
        {info.done ? (
          <p role="status" data-testid="unsubscribed">
            {t("done", { couple: info.couple, household: info.household })}
          </p>
        ) : (
          <form action={unsubscribeAction.bind(null, token)} className="space-y-5">
            <p>{t("body", { couple: info.couple, household: info.household })}</p>
            <Button type="submit">{t("confirm")}</Button>
          </form>
        )}
      </section>
    </PageShell>
  );
}
