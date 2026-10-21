import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { NotFoundError } from "@/application/errors";
import { EventList } from "@/components/schedule/event-list";
import { container } from "@/composition/container";
import { requireProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const load = cache(async (weddingId: string) => {
  const user = await requireProfile();
  try {
    return { user, ...(await container().listEvents.execute(user.id, weddingId)) };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wedding } = await load((await params).id);
  return { title: `${(await getTranslations("schedule"))("title")} · ${wedding.title}` };
}

/** The wedding's Ablauf: every event, shared by the website versions, the invitations and the response form. */
export default async function SchedulePage({ params }: Props) {
  const { wedding, events } = await load((await params).id);
  const t = await getTranslations("schedule");
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-4xl font-medium tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </header>
      <EventList
        weddingId={wedding.id}
        events={events}
        near={wedding.latitude !== null && wedding.longitude !== null ? { latitude: wedding.latitude, longitude: wedding.longitude } : null}
      />
    </div>
  );
}
