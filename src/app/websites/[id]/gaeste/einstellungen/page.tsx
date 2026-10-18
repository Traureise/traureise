import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PollList } from "@/components/guests/poll-editor";
import { RsvpSettingsForm } from "@/components/guests/rsvp-settings-form";
import { loadGuestPage } from "@/lib/guests";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await loadGuestPage((await params).id);
  return { title: `${(await getTranslations("guests.settings"))("title")} · ${page.website.title}` };
}

export default async function GuestSettingsPage({ params }: Props) {
  const { id } = await params;
  const { page } = await loadGuestPage(id);
  const t = await getTranslations("guests");
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6" data-testid="rsvp-settings">
        <h2 className="font-heading text-3xl font-medium">{t("settings.title")}</h2>
        <RsvpSettingsForm
          websiteId={id}
          settings={page.settings}
          schedule={page.schedule.map(({ id, name }) => ({ id, name }))}
          whatsappDefault={t("list.whatsappDefault", { title: page.website.title })}
          notificationsLocked={page.billingEnabled && !page.sending}
        />
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6" data-testid="rsvp-polls">
        <h2 className="font-heading text-3xl font-medium">{t("polls.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("polls.lead")}</p>
        <PollList websiteId={id} polls={page.polls.map(({ id, question, multiple, allowOther, per, options }) => ({ id, question, multiple, allowOther, per, options }))} />
      </section>
    </div>
  );
}
