import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { NotFoundError } from "@/application/errors";
import { container } from "@/composition/container";
import { requireProfile } from "./session";

/** The website being edited, loaded once per request; other people's websites are a 404. */
export const loadEditorView = cache(async (websiteId: string) => {
  const user = await requireProfile();
  try {
    return await container().getWebsiteForOwner.execute(user.id, websiteId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});
