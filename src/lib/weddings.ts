import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { NotFoundError } from "@/application/errors";
import { container } from "@/composition/container";
import { requireProfile } from "./session";

/** The wedding above every tab (and the switcher's other weddings), loaded once per request; someone else's is a 404. */
export const loadWeddingFrame = cache(async (weddingId: string) => {
  const user = await requireProfile();
  try {
    return { user, ...(await container().getWeddingFrame.execute(user.id, weddingId)) };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});
