"use server";

import { revalidatePath } from "next/cache";
import { container } from "@/composition/container";
import { runAction, type ActionResult } from "@/lib/action-result";
import { clientIp } from "@/lib/client-ip";
import { requireUser } from "@/lib/session";

async function guests<T>(websiteId: string, fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  const result = await runAction(() => fn(user.id));
  if (result.ok) revalidatePath(`/websites/${websiteId}/gaeste`, "layout");
  return result;
}

export async function saveHouseholdAction(websiteId: string, householdId: string | null, input: unknown) {
  return guests(websiteId, async (userId) => {
    await container().saveHousehold.execute(userId, websiteId, householdId, input);
    return undefined;
  });
}

export async function deleteHouseholdAction(websiteId: string, householdId: string) {
  return guests(websiteId, (userId) => container().deleteHousehold.execute(userId, websiteId, householdId));
}

export async function saveRsvpSettingsAction(websiteId: string, input: unknown) {
  return guests(websiteId, (userId) => container().saveRsvpSettings.execute(userId, websiteId, input));
}

export async function savePollAction(websiteId: string, pollId: string | null, input: unknown) {
  return guests(websiteId, async (userId) => {
    await container().savePoll.execute(userId, websiteId, pollId, input);
    return undefined;
  });
}

export async function deletePollAction(websiteId: string, pollId: string) {
  return guests(websiteId, (userId) => container().deletePoll.execute(userId, websiteId, pollId));
}

export async function decideGuestRequestAction(websiteId: string, requestId: string, decision: "added" | "declined") {
  return guests(websiteId, (userId) => container().decideGuestRequest.execute(userId, websiteId, requestId, decision));
}

/** The guests' side: the personal link's token is the only key. */
export async function submitGuestResponseAction(token: string, input: unknown): Promise<ActionResult<void>> {
  const ip = await clientIp();
  const result = await runAction(() => container().submitGuestResponse.execute({ token, input, ip }));
  if (result.ok) revalidatePath(`/antwort/${token}`);
  return result;
}
