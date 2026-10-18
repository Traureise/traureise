import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import type { Website } from "./ports";

/** Loads a website the user owns. Someone else's website looks exactly like a missing one. */
export async function loadOwnedWebsite(deps: Deps, userId: string, websiteId: string): Promise<Website> {
  const website = await deps.websites.findById(websiteId).catch(() => null);
  if (!website || website.ownerId !== userId) throw new NotFoundError();
  return website;
}

/** Image keys in form data must point at uploads made for this website. */
export async function assertOwnImage(deps: Deps, websiteId: string, key: string | null | undefined, field = "imageKey") {
  if (key && !(await deps.uploads.belongsToWebsite(key, websiteId))) throw new ValidationError({ [field]: "invalid_image" });
}

export async function deleteImage(deps: Deps, key: string | null | undefined) {
  if (!key) return;
  await deps.storage.delete(key);
  await deps.uploads.delete(key);
}
