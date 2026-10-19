"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { SendTarget } from "@/application/cards";
import { container } from "@/composition/container";
import type { CardKind, SharedVia } from "@/domain/cards";
import { runAction, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

async function cards<T>(weddingId: string, fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  const result = await runAction(() => fn(user.id));
  if (result.ok) revalidatePath(`/hochzeiten/${weddingId}`, "layout");
  return result;
}

/** Sends what was queued right after the response; the periodic job picks up anything left over. */
function sendInBackground(weddingId: string) {
  after(async () => {
    try {
      // Only what was just queued; automatic reminders belong to the regular job.
      await container().runMailJobs({ weddingId, automatic: false });
    } catch (error) {
      console.error("[traureise] sending emails failed", error);
    }
  });
}

export async function saveCardAction(weddingId: string, cardId: string, input: unknown) {
  return cards(weddingId, (userId) => container().saveCard.execute(userId, cardId, input));
}

/** The couple copied the engagement link or opened WhatsApp with it. */
export async function markEngagementSharedAction(weddingId: string, cardId: string) {
  return cards(weddingId, (userId) => container().markEngagementShared.execute(userId, cardId));
}

/** Records that the couple shared a card (WhatsApp or copied link) and returns the link and text. */
export async function shareCardAction(weddingId: string, kind: CardKind, householdId: string, via: SharedVia) {
  return cards(weddingId, (userId) => container().shareCard.execute(userId, weddingId, kind, householdId, via));
}

/** A card sent outside the app, marked by hand (or the mark undone). */
export async function markCardsSentAction(weddingId: string, kind: CardKind, target: SendTarget, sent: boolean) {
  return cards(weddingId, (userId) => container().markCardsSent.execute(userId, weddingId, kind, target, sent));
}

export async function setCardExcludedAction(weddingId: string, kind: CardKind, householdId: string, excluded: boolean) {
  return cards(weddingId, (userId) => container().setCardExcluded.execute(userId, weddingId, kind, householdId, excluded));
}

export async function sendCardEmailsAction(weddingId: string, kind: CardKind, target: SendTarget) {
  const result = await cards(weddingId, (userId) => container().sendCardEmails.execute(userId, weddingId, kind, target));
  if (result.ok && result.data.queued > 0) sendInBackground(weddingId);
  return result;
}

export async function sendRemindersAction(weddingId: string, target: SendTarget) {
  const result = await cards(weddingId, (userId) => container().sendReminders.execute(userId, weddingId, target));
  if (result.ok && result.data.queued > 0) sendInBackground(weddingId);
  return result;
}

/** The guests' side: the unsubscribe link's token is the only key. */
export async function unsubscribeAction(token: string) {
  await container().unsubscribe.execute(token);
  revalidatePath(`/abmelden/${token}`);
}
