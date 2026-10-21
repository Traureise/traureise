import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ListChecks } from "lucide-react";
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
  const contents = [
    { id: "rsvp-answers", label: t("settings.sections.answers.title") },
    { id: "rsvp-meal", label: t("settings.sections.meal.title") },
    { id: "rsvp-notify", label: t("settings.sections.notify.title") },
    { id: "rsvp-whatsapp-section", label: t("settings.sections.whatsapp.title") },
    { id: "rsvp-polls", label: t("polls.title") },
  ];
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <nav aria-label={t("settings.contents")} className="sticky top-6 hidden lg:block">
        <ul className="space-y-1 border-l border-border text-sm">
          {contents.map((c) => (
            <li key={c.id}>
              <a href={`#${c.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-muted-foreground hover:border-primary hover:text-foreground">
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="rounded-3xl border border-border bg-card px-6 sm:px-10" data-testid="rsvp-settings">
        <RsvpSettingsForm
          weddingId={id}
          settings={page.settings}
          schedule={page.schedule.map(({ id, name }) => ({ id, name }))}
          whatsappDefault={t("list.whatsappDefault", { title: page.wedding.title })}
          notificationsLocked={page.billingEnabled && !page.sending}
        />
        <SettingsSection id="rsvp-polls" icon={<ListChecks />} testId="rsvp-polls" title={t("polls.title")} description={t("polls.lead")}>
          <PollList weddingId={id} polls={page.polls.map(({ id, question, multiple, allowOther, per, options }) => ({ id, question, multiple, allowOther, per, options }))} />
        </SettingsSection>
      </div>
    </div>
  );
}
