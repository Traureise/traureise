"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import { runAction, type ActionResult } from "@/lib/action-result";
import { clearSessionCookie, requireUser, sessionToken } from "@/lib/session";

/** The address the nearest reverse proxy saw (it appends the last X-Forwarded-For entry). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip") || "unknown";
}

export async function requestMagicLinkAction(_prev: unknown, form: FormData): Promise<ActionResult<{ email: string }>> {
  const email = String(form.get("email") ?? "");
  const ip = await clientIp();
  return runAction(async () => {
    await container().requestMagicLink.execute({ email, ip });
    return { email: email.trim().toLowerCase() };
  });
}

export async function saveProfileAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => container().updateProfile.execute(user.id, { firstName: String(form.get("firstName") ?? "") }));
  if (result.ok) redirect("/dashboard");
  return { ...result, data: undefined } as ActionResult;
}

export async function logoutAction(): Promise<void> {
  await container().logout.execute(await sessionToken());
  await clearSessionCookie();
  redirect("/");
}
