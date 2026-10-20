import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PollList } from "@/components/guests/poll-editor";
import { RsvpSettingsForm } from "@/components/guests/rsvp-settings-form";
import { SettingsSection } from "@/components/app/settings-section";
import { loadGuestPage } from "@/lib/guests";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await loadGuestPage((await params).id);
  return { title: `${(await getTranslations("guests.settings"))("title")} · ${page.wedding.title}` };
}

export default async function GuestSettingsPage({ params }: Props) {
  const { id } = await params;
  const { page } = await loadGuestPage(id);
  const t = await getTranslations("guests");
  return (
    <div className="max-w-4xl" data-testid="rsvp-settings">
      <RsvpSettingsForm
        weddingId={id}
        settings={page.settings}
        schedule={page.schedule.map(({ id, name }) => ({ id, name }))}
        whatsappDefault={t("list.whatsappDefault", { title: page.wedding.title })}
        notificationsLocked={page.billingEnabled && !page.sending}
      />
      <SettingsSection id="rsvp-polls" testId="rsvp-polls" title={t("polls.title")} description={t("polls.lead")}>
        <PollList weddingId={id} polls={page.polls.map(({ id, question, multiple, allowOther, per, options }) => ({ id, question, multiple, allowOther, per, options }))} />
      </SettingsSection>
    </div>
  );
}
