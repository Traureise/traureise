import { SLUG_MAX, validateSlug } from "@/domain/slug";
import type { Deps } from "./deps";
import { ValidationError } from "./errors";

/**
 * Weddings and website versions share one namespace with the reserved words. A wedding's slug may equal one of
 * its own versions' slugs (the first version starts with it), never another wedding's or its versions'.
 * `weddingId` is null for a wedding that does not exist yet.
 */
export type SlugFor = { wedding: string | null } | { wedding: string; website: string | null };

export async function slugTaken(deps: Deps, slug: string, owner: SlugFor): Promise<boolean> {
  const { weddingIds, websites } = await deps.weddings.slugOwners(slug);
  const otherWedding = weddingIds.some((id) => id !== owner.wedding);
  if ("website" in owner) return otherWedding || websites.some((w) => w.id !== owner.website);
  return otherWedding || websites.some((w) => w.weddingId !== owner.wedding);
}

export async function assertSlugAvailable(deps: Deps, slug: string, owner: SlugFor) {
  const error = validateSlug(slug);
  if (error) throw new ValidationError({ slug: error });
  if (await slugTaken(deps, slug, owner)) throw new ValidationError({ slug: "taken" });
}

/** `base`, else `base-2`, `base-3`, … whichever is free. */
export async function uniqueSlug(deps: Deps, base: string, owner: SlugFor): Promise<string> {
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "") + suffix;
    if (!validateSlug(candidate) && !(await slugTaken(deps, candidate, owner))) return candidate;
  }
}
