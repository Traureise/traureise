"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@/application/errors";
import { container } from "@/composition/container";
import { IMPORT_MAX_BYTES } from "@/domain/guest-import";
import { importHeaders } from "@/lib/import-headers";
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

/** Reading the file changes nothing, so no revalidation. */
export async function previewGuestImportAction(weddingId: string, form: FormData) {
  const user = await requireUser();
  const file = form.get("file");
  const headers = await importHeaders();
  return runAction(async () => {
    if (!(file instanceof File)) throw new ValidationError({ file: "empty" });
    // Checked before reading the upload into memory; the use case checks the bytes again.
    if (file.size > IMPORT_MAX_BYTES) throw new ValidationError({ file: "too_large" });
    return container().previewGuestImport.execute(user.id, weddingId, { bytes: new Uint8Array(await file.arrayBuffer()) }, headers);
  });
}

export async function planGuestImportAction(weddingId: string, input: { rows: unknown; decisions: unknown; ignoredColumns: unknown }) {
  const user = await requireUser();
  return runAction(() => container().planGuestImport.execute(user.id, weddingId, input));
}

export async function importGuestsAction(weddingId: string, input: { rows: unknown; decisions: unknown }) {
  return guests(weddingId, (userId) => container().importGuests.execute(userId, weddingId, input));
}
