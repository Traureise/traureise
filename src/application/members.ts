import type { Role } from "@/domain/members";
import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import { loadWedding } from "./owned";
import type { Invitation, Member } from "./ports";

const lastAdmin = () => new ValidationError({ _: "last_admin" });

/** Members of a wedding; admins also see the pending invitations and may manage. */
export class ListMembers {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string): Promise<{ members: Member[]; invitations: Invitation[]; contactUserId: string | null; canManage: boolean }> {
    const wedding = await loadWedding(this.deps, userId, weddingId);
    const canManage = wedding.role === "admin";
    return {
      members: await this.deps.weddings.listMembers(weddingId),
      invitations: canManage ? await this.deps.invitations.listPending(weddingId, this.deps.clock.now()) : [],
      contactUserId: wedding.contactUserId,
      canManage,
    };
  }
}

/** Removes a member after checking the wedding keeps an admin, and hands the contact role on if it was theirs. */
async function withdraw(deps: Deps, weddingId: string, memberId: string, contactUserId: string | null) {
  const members = await deps.weddings.listMembers(weddingId);
  const member = members.find((m) => m.userId === memberId);
  if (!member) throw new NotFoundError();
  const admins = members.filter((m) => m.role === "admin" && m.userId !== memberId);
  if (member.role === "admin" && admins.length === 0) throw lastAdmin();
  await deps.weddings.removeMember(weddingId, memberId);
  if (contactUserId === memberId) await deps.weddings.update(weddingId, { contactUserId: admins[0]?.userId ?? null });
}

export class ChangeMemberRole {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, memberId: string, role: Role) {
    await loadWedding(this.deps, userId, weddingId, "admin");
    const members = await this.deps.weddings.listMembers(weddingId);
    const member = members.find((m) => m.userId === memberId);
    if (!member) throw new NotFoundError();
    if (member.role === "admin" && role !== "admin" && !members.some((m) => m.role === "admin" && m.userId !== memberId)) throw lastAdmin();
    await this.deps.weddings.setRole(weddingId, memberId, role);
  }
}

export class RemoveMember {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, memberId: string) {
    const wedding = await loadWedding(this.deps, userId, weddingId, "admin");
    await withdraw(this.deps, weddingId, memberId, wedding.contactUserId);
  }
}

export class LeaveWedding {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string) {
    const wedding = await loadWedding(this.deps, userId, weddingId);
    await withdraw(this.deps, weddingId, userId, wedding.contactUserId);
  }
}

export class SetContactPerson {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, memberId: string) {
    await loadWedding(this.deps, userId, weddingId, "admin");
    if (!(await this.deps.weddings.roleOf(weddingId, memberId))) throw new ValidationError({ contact: "not_a_member" });
    await this.deps.weddings.update(weddingId, { contactUserId: memberId });
  }
}
