"use server";

import { revalidatePath } from "next/cache";
import { container } from "@/composition/container";
import { runAction } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

/** The Ablauf: events belong to the wedding, so a change refreshes all of its pages (websites, cards, guests). */
async function edit<T>(fn: (userId: string) => Promise<T>) {
  const user = await requireUser();
  const result = await runAction(() => fn(user.id));
  if (result.ok) revalidatePath("/hochzeiten", "layout");
  return result;
}

/** Returns the event's id (a new event is selected right away in an event block). */
export async function saveEventAction(weddingId: string, eventId: string | null, data: Record<string, unknown>) {
  return edit(async (userId) => {
    if (eventId) {
      await container().updateEvent.execute(userId, weddingId, eventId, data);
      return eventId;
    }
    return (await container().addEvent.execute(userId, weddingId, data)).id;
  });
}

export async function deleteEventAction(weddingId: string, eventId: string) {
  return edit((userId) => container().deleteEvent.execute(userId, weddingId, eventId));
}
