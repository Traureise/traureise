import { atLeast, type Role } from "@/domain/members";
import { imageKeysOf } from "@/domain/sections";
import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import type { Card, Website, Wedding } from "./ports";

/**
 * Loads a wedding the user is a member of with at least role `min`, with the user's role. A wedding the user may
 * not use (someone else's, or an admin action for an editor) looks exactly like a missing one.
 */
export async function loadWedding(deps: Deps, userId: string, weddingId: string, min: Role = "editor"): Promise<Wedding & { role: Role }> {
  const role = await deps.weddings.roleOf(weddingId, userId).catch(() => null);
  if (!role || !atLeast(role, min)) throw new NotFoundError();
  const wedding = await deps.weddings.findById(weddingId).catch(() => null);
  if (!wedding) throw new NotFoundError();
  return { ...wedding, role };
}

/** A website version of a wedding the user is a member of. */
export async function loadWebsite(deps: Deps, userId: string, websiteId: string, min: Role = "editor"): Promise<{ wedding: Wedding & { role: Role }; website: Website }> {
  const website = await deps.websites.findById(websiteId).catch(() => null);
  if (!website) throw new NotFoundError();
  return { wedding: await loadWedding(deps, userId, website.weddingId, min), website };
}

/** A card version of a wedding the user is a member of. */
export async function loadCardVersion(deps: Deps, userId: string, cardId: string, min: Role = "editor"): Promise<{ wedding: Wedding & { role: Role }; card: Card }> {
  const card = await deps.cards.findById(cardId).catch(() => null);
  if (!card) throw new NotFoundError();
  return { wedding: await loadWedding(deps, userId, card.weddingId, min), card };
}

/** Image keys in form data must point at uploads made for this wedding. */
export async function assertOwnImage(deps: Deps, weddingId: string, key: string | null | undefined, field = "imageKey") {
  if (key && !(await deps.uploads.belongsToWedding(key, weddingId))) throw new ValidationError({ [field]: "invalid_image" });
}

export async function deleteImage(deps: Deps, key: string | null | undefined) {
  if (!key) return;
  await deps.storage.delete(key);
  await deps.uploads.delete(key);
}

/** Every photo the wedding still shows somewhere: website covers and blocks, events, cards. */
async function imagesInUse(deps: Deps, weddingId: string): Promise<Set<string>> {
  const [websites, events, cards] = await Promise.all([deps.websites.listByWedding(weddingId), deps.weddings.listEvents(weddingId), deps.cards.listByWedding(weddingId)]);
  const keys = new Set<string>();
  for (const website of websites) {
    if (website.coverImageKey) keys.add(website.coverImageKey);
    for (const block of await deps.websites.listBlocks(website.id)) for (const key of imageKeysOf(block.data)) keys.add(key);
  }
  for (const event of events) for (const key of imageKeysOf(event.data)) keys.add(key);
  for (const card of cards) if (card.photoKey) keys.add(card.photoKey);
  return keys;
}

/**
 * Deletes photos nothing in the wedding uses any more. Versions copied from each other and cards made from
 * the cover share photos, so a photo replaced in one place may still be shown in another.
 */
export async function releaseImages(deps: Deps, weddingId: string, keys: readonly (string | null | undefined)[]) {
  const candidates = keys.filter((k): k is string => !!k);
  if (candidates.length === 0) return;
  const inUse = await imagesInUse(deps, weddingId);
  for (const key of new Set(candidates)) if (!inUse.has(key)) await deleteImage(deps, key);
}
