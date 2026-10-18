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

export async function createWebsiteAction(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const result = await runAction(async () => {
    const website = await container().createWebsite.execute(user.id, {
      title: String(form.get("title") ?? ""),
      weddingDate: str(form, "weddingDate"),
      slug: str(form, "slug"),
      themeId: str(form, "themeId"),
    });
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
