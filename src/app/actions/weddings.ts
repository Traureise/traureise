"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValidationError } from "@/application/errors";
import { container } from "@/composition/container";
import type { AssignableItem, VersionItem } from "@/domain/weddings";
import { runAction, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

const field = (form: FormData, key: string) => String(form.get(key) ?? "");

/** The wedding's details from WeddingDetailsFields ("hasDate" is the yes/no answer). */
const details = (form: FormData) => ({
  title: field(form, "title"),
  hasDate: form.get("hasDate") === "yes",
  weddingDate: field(form, "weddingDate"),
  location: field(form, "location"),
  timezone: form.get("timezone") === null ? undefined : field(form, "timezone"),
});

async function wedding<T>(weddingId: string, fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  const result = await runAction(() => fn(user.id));
  if (result.ok) revalidatePath(`/hochzeiten/${weddingId}`, "layout");
  return result;
}

/** The Hochzeit form: creates the wedding with every first version and opens its home. */
export async function createWeddingAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => container().createWedding.execute(user.id, details(form)));
  if (!result.ok) return result;
  redirect(`/hochzeiten/${result.data.id}`);
}

/** Names, date, place, time zone and (if given) the wedding's address, from the details dialog. */
export async function updateWeddingDetailsAction(weddingId: string, _prev: unknown, form: FormData): Promise<ActionResult> {
  return wedding(weddingId, async (userId) => {
    const c = container();
    const slug = form.get("slug");
    // Both, so the form shows every field error at once.
    const results = await Promise.allSettled([
      c.updateWeddingDetails.execute(userId, weddingId, details(form)),
      typeof slug === "string" ? c.updateWeddingSlug.execute(userId, weddingId, slug) : Promise.resolve(null),
    ]);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason as unknown);
    if (failures.length === 2 && failures.every((f) => f instanceof ValidationError)) {
      throw new ValidationError(Object.assign({}, ...failures.map((f) => (f as ValidationError).fieldErrors)));
    }
    if (failures.length > 0) throw failures[0];
    return undefined;
  });
}

export async function deleteWeddingAction(weddingId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(async () => {
    await container().deleteWedding.execute(user.id, weddingId);
    return undefined;
  });
  if (result.ok) revalidatePath("/hochzeiten");
  return result;
}

export async function addVersionAction(weddingId: string, item: VersionItem, input: { label: string; copyFrom: string | null }) {
  return wedding(weddingId, async (userId) => ({ id: (await container().addVersion.execute(userId, weddingId, item, input)).id }));
}

export async function renameVersionAction(weddingId: string, item: VersionItem, versionId: string, label: string) {
  return wedding(weddingId, (userId) => container().renameVersion.execute(userId, weddingId, item, versionId, label));
}

export async function deleteVersionAction(weddingId: string, item: VersionItem, versionId: string) {
  return wedding(weddingId, (userId) => container().deleteVersion.execute(userId, weddingId, item, versionId));
}

/** On the guest list: which version of an item a household gets. */
export async function assignVersionAction(weddingId: string, householdId: string, item: AssignableItem, versionId: string) {
  return wedding(weddingId, (userId) => container().assignVersion.execute(userId, weddingId, householdId, item, versionId));
}
