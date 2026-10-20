"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValidationError } from "@/application/errors";
import { container } from "@/composition/container";
import type { Direction } from "@/domain/ordering";
import type { SectionTemplate } from "@/domain/sections";
import { runAction, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

/** Website versions live under their wedding; editing one refreshes the wedding's pages (home, editor). */
async function edit<T>(_websiteId: string, fn: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  const result = await runAction(() => fn(user.id));
  if (result.ok) revalidatePath("/hochzeiten", "layout");
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

/** Photos belong to the wedding: its website versions and cards share them. */
export async function uploadImageAction(weddingId: string, form: FormData): Promise<ActionResult<string>> {
  const user = await requireUser();
  const file = form.get("file");
  return runAction(async () => {
    if (!(file instanceof File)) throw new ValidationError({ file: "empty" });
    return container().uploadImage.execute(user.id, weddingId, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      size: file.size,
      contentType: file.type,
    });
  });
}

export async function setCoverImageAction(websiteId: string, imageKey: string | null) {
  return edit(websiteId, (userId) => container().setCoverImage.execute(userId, websiteId, imageKey));
}

export async function addSectionAction(websiteId: string, template: SectionTemplate | null) {
  return edit(websiteId, async (userId) => (await container().addSection.execute(userId, websiteId, { template })).id);
}

export async function updateSectionAction(websiteId: string, sectionId: string, patch: { title?: string; visible?: boolean }) {
  return edit(websiteId, (userId) => container().updateSection.execute(userId, websiteId, sectionId, patch));
}

/** Goes back to the version's overview: the deleted section's page no longer exists. */
export async function deleteSectionAction(weddingId: string, websiteId: string, sectionId: string) {
  const result = await edit(websiteId, (userId) => container().deleteSection.execute(userId, websiteId, sectionId));
  if (result.ok) redirect(`/hochzeiten/${weddingId}/website/${websiteId}`);
  return result;
}

export async function moveSectionAction(websiteId: string, sectionId: string, direction: Direction) {
  return edit(websiteId, (userId) => container().moveSection.execute(userId, websiteId, sectionId, direction));
}

export async function saveBlockAction(websiteId: string, sectionId: string, blockId: string | null, data: Record<string, unknown>) {
  return edit(websiteId, async (userId) => {
    if (blockId) await container().updateBlock.execute(userId, websiteId, blockId, data);
    else await container().addBlock.execute(userId, websiteId, sectionId, data);
    return undefined;
  });
}

export async function deleteBlockAction(websiteId: string, blockId: string) {
  return edit(websiteId, (userId) => container().deleteBlock.execute(userId, websiteId, blockId));
}

export async function moveBlockAction(websiteId: string, blockId: string, direction: Direction) {
  return edit(websiteId, (userId) => container().moveBlock.execute(userId, websiteId, blockId, direction));
}

export async function selectThemeAction(websiteId: string, themeId: string) {
  return edit(websiteId, (userId) => container().selectTheme.execute(userId, websiteId, themeId));
}

export async function updateDesignAction(websiteId: string, input: { paletteId: string | null; fontPairingId: string | null }) {
  return edit(websiteId, (userId) => container().updateDesign.execute(userId, websiteId, input));
}

export async function setPublishedAction(websiteId: string, published: boolean) {
  return edit(websiteId, (userId) => container().setPublished.execute(userId, websiteId, published));
}
