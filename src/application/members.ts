import { isValidEmail, normalizeEmail } from "@/domain/email";
import { isRole } from "@/domain/members";
import { startSession, type LoginResult } from "./auth";
import type { Deps } from "./deps";
import { InvalidTokenError, NotFoundError, RateLimitedError, ValidationError } from "./errors";
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

/** Email addresses of the wedding's admins: the recipients of the wedding's own mail. */
export async function adminEmails(deps: Deps, weddingId: string): Promise<string[]> {
  return (await deps.weddings.listMembers(weddingId)).filter((m) => m.role === "admin").map((m) => m.email);
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

  async execute(userId: string, weddingId: string, memberId: string, role: string) {
    await loadWedding(this.deps, userId, weddingId, "admin");
    if (!isRole(role)) throw new ValidationError({ role: "invalid_role" });
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

export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const INVITE_WINDOW_MS = 60 * 60 * 1000;
const MAX_INVITES_PER_USER = 20;

/** Mails a single-use link that makes the address a member; replaces a pending invitation for the same address. */
export class InviteMember {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, input: { email: string; role: string }): Promise<Invitation> {
    const { weddings, users, invitations, rateLimiter, clock, tokens, mailer, invitationMail, appUrl } = this.deps;
    const wedding = await loadWedding(this.deps, userId, weddingId, "admin");
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) throw new ValidationError({ email: "invalid_email" });
    if (!isRole(input.role)) throw new ValidationError({ role: "invalid_role" });
    const role = input.role;
    if ((await weddings.listMembers(weddingId)).some((m) => normalizeEmail(m.email) === email)) throw new ValidationError({ email: "already_member" });

    const now = clock.now();
    if (!(await rateLimiter.hit(`invite:user:${userId}`, MAX_INVITES_PER_USER, INVITE_WINDOW_MS, now))) throw new RateLimitedError();

    const token = tokens.generate();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const invitation = await invitations.replace({ weddingId, email, role, invitedBy: userId, expiresAt, tokenHash: tokens.hash(token) });
    const inviter = await users.findById(userId);
    const link = `${appUrl}/einladung?token=${encodeURIComponent(token)}`;
    await mailer.send({
      to: email,
      ...invitationMail.render({ link, inviter: inviter?.firstName || inviter?.email || "", weddingTitle: wedding.title, role, expiresOn: expiresAt }),
    });
    return invitation;
  }
}

export class WithdrawInvitation {
  constructor(private deps: Deps) {}

  async execute(userId: string, weddingId: string, invitationId: string) {
    await loadWedding(this.deps, userId, weddingId, "admin");
    const pending = await this.deps.invitations.listPending(weddingId, this.deps.clock.now());
    if (!pending.some((i) => i.id === invitationId)) throw new NotFoundError();
    await this.deps.invitations.delete(invitationId);
  }
}

/**
 * Redeems an invitation link: makes its address a member and logs that account in. Someone logged in with another
 * account is refused and the invitation stays, so the link never hands a wedding to the wrong person.
 */
export class AcceptInvitation {
  constructor(private deps: Deps) {}

  async execute(input: { token: string; currentUserId: string | null }): Promise<LoginResult & { weddingId: string }> {
    const { invitations, users, weddings, tokens, clock } = this.deps;
    const now = clock.now();
    const invitation = input.token ? await invitations.findByHash(tokens.hash(input.token)) : null;
    if (!invitation || invitation.expiresAt <= now) throw new InvalidTokenError();
    if (input.currentUserId) {
      const current = await users.findById(input.currentUserId);
      if (current && normalizeEmail(current.email) !== invitation.email) throw new ValidationError({ _: "other_account" });
    }
    if (!(await invitations.delete(invitation.id))) throw new InvalidTokenError();

    const user = (await users.findByEmail(invitation.email)) ?? (await users.create(invitation.email));
    await weddings.addMember(invitation.weddingId, user.id, invitation.role);
    return { ...(await startSession(this.deps, user, now)), weddingId: invitation.weddingId };
  }
}
