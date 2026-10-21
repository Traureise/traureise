import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { cache } from "react";
import { saveCoupleAnswerAction } from "@/app/actions/guests";
import { NotFoundError } from "@/application/errors";
import { GuestForm } from "@/components/guests/guest-form";
import { siteStyle } from "@/components/site/site-style";
import { container } from "@/composition/container";
import { requireProfile } from "@/lib/session";

type Props = { params: Promise<{ id: string; householdId: string }> };

const load = cache(async (weddingId: string, householdId: string) => {
  const user = await requireProfile();
  try {
    return await container().getCoupleAnswerForm.execute(user.id, weddingId, householdId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, householdId } = await params;
  const form = await load(id, householdId);
  return { title: `${(await getTranslations("guests.answerFor"))("title", { household: form.household.name })} · ${form.website.title}` };
}

/** The couple fills in a household's answer for it, in the form the household would see (grandparents without a phone). */
export default async function CoupleAnswerPage({ params }: Props) {
  const { id, householdId } = await params;
  const form = await load(id, householdId);
  const t = await getTranslations("guests.answerFor");
  return (
    <div className="space-y-4">
      <Link href={`/hochzeiten/${id}/gaeste`} className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <h2 className="font-heading text-3xl font-medium">{t("title", { household: form.household.name })}</h2>
      <div className="site overflow-hidden rounded-2xl border border-border" style={siteStyle(form.design)} data-testid="couple-answer">
        <GuestForm form={form} save={saveCoupleAnswerAction.bind(null, id, householdId)} doneHref={`/hochzeiten/${id}/gaeste`} />
      </div>
    </div>
  );
}
