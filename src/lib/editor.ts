import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { NotFoundError } from "@/application/errors";
import { container } from "@/composition/container";
import { requireProfile } from "./session";

/** The website version being edited, loaded once per request; other people's versions (or another wedding's) are a 404. */
export const loadEditorView = cache(async (weddingId: string, websiteId: string) => {
  const user = await requireProfile();
  try {
    const view = await container().getWebsiteForOwner.execute(user.id, websiteId);
    if (view.wedding.id !== weddingId) notFound();
    return view;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});
