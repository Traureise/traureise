"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SendTarget } from "@/application/cards";
import { container } from "@/composition/container";
import { CARD_SLUGS, type CardKind, type SharedVia } from "@/domain/cards";
import { runAction, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

async function cards<T>(websiteId: string, fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  const result = await runAction(() => fn(user.id));
  if (result.ok) {
    revalidatePath(`/websites/${websiteId}/gaeste`, "layout");
    revalidatePath(`/websites/${websiteId}/karten`, "layout");
    revalidatePath("/dashboard");
  }
  return result;
}

/** Sends what was queued right after the response; the periodic job picks up anything left over. */
function sendInBackground(websiteId: string) {
  after(async () => {
    try {
      await container().runMailJobs({ websiteId });
    } catch (error) {
      console.error("[traureise] sending emails failed", error);
    }
  });
}

/** Opens the card editor, creating the website's card of this kind first if there is none. */
export async function createCardAction(websiteId: string, kind: CardKind) {
  const user = await requireUser();
  const result = await runAction(() => container().createCard.execute(user.id, websiteId, kind));
  if (!result.ok) return result;
  redirect(`/websites/${websiteId}/karten/${CARD_SLUGS[kind]}`);
}

export async function saveCardAction(websiteId: string, kind: CardKind, input: unknown) {
  return cards(websiteId, (userId) => container().saveCard.execute(userId, websiteId, kind, input));
}

export async function deleteCardAction(websiteId: string, kind: CardKind) {
  return cards(websiteId, (userId) => container().deleteCard.execute(userId, websiteId, kind));
}

/** Records that the couple shared a card (WhatsApp or copied link) and returns the link and text. */
export async function shareCardAction(websiteId: string, kind: CardKind, householdId: string, via: SharedVia) {
  return cards(websiteId, (userId) => container().shareCard.execute(userId, websiteId, kind, householdId, via));
}

export async function setCardExcludedAction(websiteId: string, kind: CardKind, householdId: string, excluded: boolean) {
  return cards(websiteId, (userId) => container().setCardExcluded.execute(userId, websiteId, kind, householdId, excluded));
}

export async function sendCardEmailsAction(websiteId: string, kind: CardKind, target: SendTarget) {
  const result = await cards(websiteId, (userId) => container().sendCardEmails.execute(userId, websiteId, kind, target));
  if (result.ok && result.data.queued > 0) sendInBackground(websiteId);
  return result;
}

export async function sendRemindersAction(websiteId: string, target: SendTarget) {
  const result = await cards(websiteId, (userId) => container().sendReminders.execute(userId, websiteId, target));
  if (result.ok && result.data.queued > 0) sendInBackground(websiteId);
  return result;
}

/** The guests' side: the unsubscribe link's token is the only key. */
export async function unsubscribeAction(token: string) {
  await container().unsubscribe.execute(token);
  revalidatePath(`/abmelden/${token}`);
}
