"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { runAction, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

const str = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

/** Creates a new wedding with its website, or (with `websiteId`) the website of a wedding that only had cards. */
export async function createWebsiteAction(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const result = await runAction(async () => {
    const input = {
      title: String(form.get("title") ?? ""),
      weddingDate: str(form, "weddingDate"),
      slug: str(form, "slug"),
      themeId: str(form, "themeId"),
    };
    const websiteId = str(form, "websiteId");
    const c = container();
    const website = websiteId ? await c.enableSite.execute(user.id, websiteId, input) : await c.createWebsite.execute(user.id, input);
    return { id: website.id };
  });
  if (result.ok) redirect(`/websites/${result.data.id}/edit`);
  return result;
}

export async function deleteWebsiteAction(websiteId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(async () => {
    await container().deleteWebsite.execute(user.id, websiteId);
    return undefined;
  });
  revalidatePath("/dashboard");
  return result;
}

/** Names, date and place of a wedding, from the dashboard or the card editor. */
export async function updateWeddingDetailsAction(websiteId: string, _prev: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(async () => {
    await container().updateWeddingDetails.execute(user.id, websiteId, {
      title: String(form.get("title") ?? ""),
      weddingDate: String(form.get("weddingDate") ?? ""),
      location: String(form.get("location") ?? ""),
    });
    return undefined;
  });
  if (result.ok) {
    revalidatePath("/dashboard");
    revalidatePath(`/websites/${websiteId}`, "layout");
  }
  return result;
}
