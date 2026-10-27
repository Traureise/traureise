"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { container } from "@/composition/container";
import type { Role } from "@/domain/members";
import { runAction, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

async function members(weddingId: string, fn: (userId: string) => Promise<unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(async () => {
    await fn(user.id);
    return undefined;
  });
  if (result.ok) revalidatePath(`/hochzeiten/${weddingId}`, "layout");
  return result;
}

/** The invite form of the Personen section: mails the link to the address. */
export async function inviteMemberAction(weddingId: string, _prev: unknown, form: FormData): Promise<ActionResult> {
  return members(weddingId, (userId) =>
    container().inviteMember.execute(userId, weddingId, { email: String(form.get("email") ?? ""), role: String(form.get("role") ?? "") }),
  );
}

export async function withdrawInvitationAction(weddingId: string, invitationId: string): Promise<ActionResult> {
  return members(weddingId, (userId) => container().withdrawInvitation.execute(userId, weddingId, invitationId));
}

export async function changeMemberRoleAction(weddingId: string, memberId: string, role: Role): Promise<ActionResult> {
  return members(weddingId, (userId) => container().changeMemberRole.execute(userId, weddingId, memberId, role));
}

export async function removeMemberAction(weddingId: string, memberId: string): Promise<ActionResult> {
  return members(weddingId, (userId) => container().removeMember.execute(userId, weddingId, memberId));
}

export async function setContactPersonAction(weddingId: string, memberId: string): Promise<ActionResult> {
  return members(weddingId, (userId) => container().setContactPerson.execute(userId, weddingId, memberId));
}

/** Leaves the wedding and opens the account's next one (or the Hochzeit form). */
export async function leaveWeddingAction(weddingId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await runAction(() => container().leaveWedding.execute(user.id, weddingId));
  if (!result.ok) return result;
  revalidatePath("/hochzeiten");
  redirect("/dashboard");
}
