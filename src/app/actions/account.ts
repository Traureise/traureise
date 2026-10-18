"use server";

import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { runAction, type ActionResult } from "@/lib/action-result";
import { clearSessionCookie, requireUser } from "@/lib/session";

export async function deleteAccountAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => container().deleteAccount.execute(user.id, String(form.get("email") ?? "")));
  if (!result.ok) return result;
  await clearSessionCookie();
  redirect("/?konto=geloescht");
}
