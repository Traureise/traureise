import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { NotFoundError } from "@/application/errors";
import { container } from "@/composition/container";
import { requireProfile } from "./session";

/** The Gäste page data, loaded once per request; other people's weddings are a 404. */
export const loadGuestPage = cache(async (weddingId: string) => {
  const user = await requireProfile();
  try {
    return { user, page: await container().getGuestPage.execute(user.id, weddingId) };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});
