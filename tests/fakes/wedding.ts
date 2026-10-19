import type { Deps } from "@/application/deps";
import { CreateWedding } from "@/application/weddings";

/** A wedding with its generated items; `websiteId` is its first website version (a draft unless `published`). */
export async function newWedding(deps: Deps, ownerId: string, input: { title?: string; weddingDate?: string; published?: boolean } = {}) {
  const { title = "Anna & Ben", weddingDate, published = false } = input;
  const wedding = await new CreateWedding(deps).execute(ownerId, { title, hasDate: !!weddingDate, weddingDate });
  const [website] = await deps.websites.listByWedding(wedding.id);
  if (published) await deps.websites.update(website!.id, { published: true });
  return { wedding, weddingId: wedding.id, websiteId: website!.id };
}
