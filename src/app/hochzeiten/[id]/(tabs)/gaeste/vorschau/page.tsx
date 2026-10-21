import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GuestForm } from "@/components/guests/guest-form";
import { siteStyle } from "@/components/site/site-style";
import { container } from "@/composition/container";
import { loadGuestPage } from "@/lib/guests";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await loadGuestPage((await params).id);
  return { title: `${(await getTranslations("guests.tabs"))("preview")} · ${page.wedding.title}` };
}

/** The guest form as guests see it. Free, and nothing is sent. */
export default async function GuestFormPreviewPage({ params }: Props) {
  const { id } = await params;
  const { user } = await loadGuestPage(id);
  const t = await getTranslations("guests.preview");
  const form = await container().getGuestFormPreview.execute(user.id, id, { household: t("sampleHousehold"), people: [t("samplePerson1"), t("samplePerson2")] });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("lead")}</p>
      <div className="site overflow-hidden rounded-2xl border border-border" style={siteStyle(form.design)} data-testid="guest-form-preview">
        <GuestForm form={form} save={null} />
      </div>
    </div>
  );
}
