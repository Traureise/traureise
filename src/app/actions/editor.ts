"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@/application/errors";
import { container } from "@/composition/container";
import type { Direction } from "@/domain/ordering";
import type { CollectionKind, SectionKind } from "@/domain/sections";
import { runAction, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

async function edit<T>(websiteId: string, fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  const result = await runAction(() => fn(user.id));
  if (result.ok) revalidatePath(`/websites/${websiteId}/edit`, "layout");
  return result;
}

export async function saveHomeAction(websiteId: string, input: Record<string, unknown> & { slug: string }) {
  return edit(websiteId, async (userId) => {
    const { slug, ...home } = input;
    // Run both so the form can show every field error at once.
    const [homeResult, slugResult] = await Promise.allSettled([
      container().updateHome.execute(userId, websiteId, home),
      container().updateSlug.execute(userId, websiteId, slug),
    ]);
    const failures = [homeResult, slugResult].filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length === 1) throw failures[0]!.reason;
    if (failures.length === 2) {
      const [a, b] = failures.map((f) => f.reason);
      if (a instanceof ValidationError && b instanceof ValidationError) throw new ValidationError({ ...a.fieldErrors, ...b.fieldErrors });
      throw a;
    }
    return undefined;
  });
}

export async function uploadImageAction(websiteId: string, form: FormData): Promise<ActionResult<string>> {
  const user = await requireUser();
  const file = form.get("file");
  return runAction(async () => {
    if (!(file instanceof File)) throw new ValidationError({ file: "empty" });
    return container().uploadImage.execute(user.id, websiteId, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      size: file.size,
      contentType: file.type,
    });
  });
}

export async function setCoverImageAction(websiteId: string, imageKey: string | null) {
  return edit(websiteId, (userId) => container().setCoverImage.execute(userId, websiteId, imageKey));
}

export async function updateSectionAction(websiteId: string, kind: SectionKind, patch: { title?: string; visible?: boolean; body?: string }) {
  return edit(websiteId, (userId) => container().updateSection.execute(userId, websiteId, kind, patch));
}

export async function saveItemAction(websiteId: string, kind: CollectionKind, itemId: string | null, data: Record<string, unknown>) {
  return edit(websiteId, async (userId) => {
    if (itemId) await container().updateItem.execute(userId, websiteId, itemId, data);
    else await container().addItem.execute(userId, websiteId, kind, data);
    return undefined;
  });
}

export async function deleteItemAction(websiteId: string, itemId: string) {
  return edit(websiteId, (userId) => container().deleteItem.execute(userId, websiteId, itemId));
}

export async function moveItemAction(websiteId: string, itemId: string, direction: Direction) {
  return edit(websiteId, (userId) => container().moveItem.execute(userId, websiteId, itemId, direction));
}

export async function selectThemeAction(websiteId: string, themeId: string) {
  return edit(websiteId, (userId) => container().selectTheme.execute(userId, websiteId, themeId));
}

export async function updateDesignAction(websiteId: string, input: { paletteId: string | null; fontPairingId: string | null }) {
  return edit(websiteId, (userId) => container().updateDesign.execute(userId, websiteId, input));
}
