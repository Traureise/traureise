import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Trash2, UsersRound } from "lucide-react";
import { SettingsSection } from "@/components/app/settings-section";
import { DeleteWeddingButton } from "@/components/weddings/delete-wedding-button";
import { MembersSection } from "@/components/weddings/members-section";
import { WeddingDetailsForm } from "@/components/weddings/wedding-details-form";
import { container } from "@/composition/container";
import { timeZoneOptions } from "@/lib/format";
import { loadWeddingFrame } from "@/lib/weddings";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ zurueck?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wedding } = await loadWeddingFrame((await params).id);
  return { title: `${(await getTranslations("weddings.details"))("title")} · ${wedding.title}` };
}

/** The Hochzeit tab: names, date, place, time zone and address, which every card and website version share. */
export default async function WeddingDetailsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { zurueck } = await searchParams;
  const { user, wedding } = await loadWeddingFrame(id);
  const people = await container().listMembers.execute(user.id, id);
  const t = await getTranslations("weddings.details");
  const tMembers = await getTranslations("weddings.members");
  // Only back into this wedding (a card or the website editor), never elsewhere.
  const back = zurueck?.startsWith(`/hochzeiten/${id}/`) && !zurueck.includes("//") ? zurueck : null;
  const contents = [
    { id: "wedding-names", label: t("sections.names.title") },
    { id: "wedding-place", label: t("sections.place.title") },
    { id: "wedding-address", label: t("sections.address.title") },
    { id: "wedding-members", label: tMembers("title") },
    // Deleting the wedding is for admins only.
    ...(people.canManage ? [{ id: "wedding-delete", label: t("sections.delete.title") }] : []),
  ];
  return (
    <div className="space-y-8">
      <header className="max-w-3xl space-y-2">
        <h1 className="font-heading text-4xl font-medium tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </header>
      <div className="grid items-start gap-10 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label={t("contents")} className="sticky top-6 hidden lg:block">
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
        <div className="space-y-8">
          <div className="rounded-3xl border border-border bg-card px-6 sm:px-10" data-testid="wedding-details">
            <WeddingDetailsForm wedding={wedding} appUrl={container().appUrl} timeZones={timeZoneOptions()} back={back} />
          </div>
          <div className="rounded-3xl border border-border bg-card px-6 sm:px-10">
            <SettingsSection
              id="wedding-members"
              testId="wedding-members"
              icon={<UsersRound />}
              title={tMembers("title")}
              description={people.canManage ? tMembers("leadAdmin") : tMembers("leadEditor")}
            >
              <MembersSection
                weddingId={wedding.id}
                weddingTitle={wedding.title}
                currentUserId={user.id}
                members={people.members.map(({ userId, email, firstName, role }) => ({ userId, email, firstName, role }))}
                invitations={people.invitations.map(({ id, email, role, expiresAt }) => ({ id, email, role, expiresAt }))}
                contactUserId={people.contactUserId}
                canManage={people.canManage}
              />
            </SettingsSection>
            {people.canManage && (
              <SettingsSection id="wedding-delete" icon={<Trash2 />} tone="danger" title={t("sections.delete.title")} description={t("sections.delete.lead")}>
                <DeleteWeddingButton weddingId={wedding.id} title={wedding.title} />
              </SettingsSection>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
