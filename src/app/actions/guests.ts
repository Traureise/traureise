"use server";

import { revalidatePath } from "next/cache";
import { container } from "@/composition/container";
import { runAction, type ActionResult } from "@/lib/action-result";
import { clientIp } from "@/lib/client-ip";
import { requireUser } from "@/lib/session";

async function guests<T>(weddingId: string, fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  const result = await runAction(() => fn(user.id));
  if (result.ok) revalidatePath(`/hochzeiten/${weddingId}`, "layout");
  return result;
}

export async function saveHouseholdAction(weddingId: string, householdId: string | null, input: unknown) {
  return guests(weddingId, async (userId) => {
    await container().saveHousehold.execute(userId, weddingId, householdId, input);
    return undefined;
  });
}

export async function deleteHouseholdAction(weddingId: string, householdId: string) {
  return guests(weddingId, (userId) => container().deleteHousehold.execute(userId, weddingId, householdId));
}

export async function saveRsvpSettingsAction(weddingId: string, input: unknown) {
  return guests(weddingId, (userId) => container().saveRsvpSettings.execute(userId, weddingId, input));
}

export async function savePollAction(weddingId: string, pollId: string | null, input: unknown) {
  return guests(weddingId, async (userId) => {
    await container().savePoll.execute(userId, weddingId, pollId, input);
    return undefined;
  });
}

export async function deletePollAction(weddingId: string, pollId: string) {
  return guests(weddingId, (userId) => container().deletePoll.execute(userId, weddingId, pollId));
}

export async function decideGuestRequestAction(weddingId: string, requestId: string, decision: "added" | "declined") {
  return guests(weddingId, (userId) => container().decideGuestRequest.execute(userId, weddingId, requestId, decision));
}

/** The couple enters a household's answer for it (grandparents without a phone). */
export async function saveCoupleAnswerAction(weddingId: string, householdId: string, input: unknown): Promise<ActionResult<void>> {
  return guests(weddingId, (userId) => container().saveCoupleAnswer.execute(userId, weddingId, householdId, input));
}

/** The guests' side: the personal link's token is the only key. */
export async function submitGuestResponseAction(token: string, input: unknown): Promise<ActionResult<void>> {
  const ip = await clientIp();
  const result = await runAction(() => container().submitGuestResponse.execute({ token, input, ip }));
  if (result.ok) revalidatePath(`/antwort/${token}`);
  return result;
}
