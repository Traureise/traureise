import { beforeEach, describe, expect, it } from "vitest";
import { InvalidTokenError, NotFoundError, RateLimitedError, ValidationError } from "@/application/errors";
import {
  AcceptInvitation,
  ChangeMemberRole,
  INVITATION_TTL_MS,
  InviteMember,
  LeaveWedding,
  ListMembers,
  RemoveMember,
  SetContactPerson,
  WithdrawInvitation,
} from "@/application/members";
import { CreateWedding, ListWeddings } from "@/application/weddings";
import type { Role } from "@/domain/members";
import { createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: { id: string };
let weddingId: string;

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  anna = await f.users.create("anna@example.org");
  weddingId = (await new CreateWedding(f.deps).execute(anna.id, { title: "Anna & Ben", hasDate: false })).id;
});

/** Adds a member who joined `minutes` after the creator, so "oldest" is well defined. */
async function join(email: string, role: Role, minutes: number) {
  const user = await f.users.create(email);
  await f.weddings.addMember(weddingId, user.id, role);
  const member = f.weddings.members.find((m) => m.weddingId === weddingId && m.userId === user.id)!;
  member.createdAt = new Date(Date.now() + minutes * 60_000);
  return user;
}
const contact = async () => (await f.weddings.findById(weddingId))!.contactUserId;

describe("admin-only actions", () => {
  it("are invisible to editors", async () => {
    const ben = await join("ben@example.org", "editor", 1);
    await expect(new ChangeMemberRole(f.deps).execute(ben.id, weddingId, anna.id, "editor")).rejects.toBeInstanceOf(NotFoundError);
    await expect(new RemoveMember(f.deps).execute(ben.id, weddingId, anna.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new SetContactPerson(f.deps).execute(ben.id, weddingId, ben.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("changing roles", () => {
  it("lets an admin demote another admin", async () => {
    const clara = await join("clara@example.org", "admin", 1);
    await new ChangeMemberRole(f.deps).execute(anna.id, weddingId, clara.id, "editor");
    expect(await f.weddings.roleOf(weddingId, clara.id)).toBe("editor");
  });

  it("refuses to demote the only admin", async () => {
    await expect(new ChangeMemberRole(f.deps).execute(anna.id, weddingId, anna.id, "editor")).rejects.toEqual(new ValidationError({ _: "last_admin" }));
    expect(await f.weddings.roleOf(weddingId, anna.id)).toBe("admin");
  });

  it("treats a non-member as not found", async () => {
    const eve = await f.users.create("eve@example.org");
    await expect(new ChangeMemberRole(f.deps).execute(anna.id, weddingId, eve.id, "admin")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("removing and leaving", () => {
  it("removes a member", async () => {
    const ben = await join("ben@example.org", "editor", 1);
    await new RemoveMember(f.deps).execute(anna.id, weddingId, ben.id);
    expect(await f.weddings.roleOf(weddingId, ben.id)).toBeNull();
  });

  it("refuses to remove the only admin, also oneself", async () => {
    await join("ben@example.org", "editor", 1);
    await expect(new RemoveMember(f.deps).execute(anna.id, weddingId, anna.id)).rejects.toEqual(new ValidationError({ _: "last_admin" }));
  });

  it("refuses to let the only admin leave", async () => {
    await expect(new LeaveWedding(f.deps).execute(anna.id, weddingId)).rejects.toEqual(new ValidationError({ _: "last_admin" }));
  });

  it("lets an admin leave when another admin remains, and the wedding leaves their list", async () => {
    const clara = await join("clara@example.org", "admin", 1);
    await new LeaveWedding(f.deps).execute(clara.id, weddingId);
    expect(await new ListWeddings(f.deps).execute(clara.id)).toEqual([]);
    expect(await contact()).toBe(anna.id);
  });

  it("lets an editor leave", async () => {
    const ben = await join("ben@example.org", "editor", 1);
    await new LeaveWedding(f.deps).execute(ben.id, weddingId);
    expect(await f.weddings.roleOf(weddingId, ben.id)).toBeNull();
  });

  it("hides the wedding from a stranger leaving", async () => {
    const eve = await f.users.create("eve@example.org");
    await expect(new LeaveWedding(f.deps).execute(eve.id, weddingId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("moves the contact person to the oldest remaining admin", async () => {
    const late = await join("late@example.org", "admin", 10);
    const early = await join("early@example.org", "admin", 5);
    await join("ed@example.org", "editor", 1);
    expect(await contact()).toBe(anna.id);
    await new RemoveMember(f.deps).execute(early.id, weddingId, anna.id);
    expect(await contact()).toBe(early.id);
    await new LeaveWedding(f.deps).execute(early.id, weddingId);
    expect(await contact()).toBe(late.id);
  });

  it("keeps the contact person when someone else leaves", async () => {
    const ben = await join("ben@example.org", "editor", 1);
    await new RemoveMember(f.deps).execute(anna.id, weddingId, ben.id);
    expect(await contact()).toBe(anna.id);
  });
});

describe("the contact person", () => {
  it("can be set to any member", async () => {
    const ben = await join("ben@example.org", "editor", 1);
    await new SetContactPerson(f.deps).execute(anna.id, weddingId, ben.id);
    expect(await contact()).toBe(ben.id);
  });

  it("must be a member", async () => {
    const eve = await f.users.create("eve@example.org");
    await expect(new SetContactPerson(f.deps).execute(anna.id, weddingId, eve.id)).rejects.toEqual(new ValidationError({ contact: "not_a_member" }));
  });
});

describe("listing members", () => {
  it("gives admins members, pending invitations and the right to manage", async () => {
    const ben = await join("ben@example.org", "editor", 1);
    await f.invitations.replace({ weddingId, email: "new@example.org", role: "editor", invitedBy: anna.id, expiresAt: new Date(Date.now() + 86_400_000), tokenHash: "h" });
    const view = await new ListMembers(f.deps).execute(anna.id, weddingId);
    expect(view.members.map((m) => m.userId)).toEqual([anna.id, ben.id]);
    expect(view.invitations.map((i) => i.email)).toEqual(["new@example.org"]);
    expect(view).toMatchObject({ canManage: true, contactUserId: anna.id });
  });

  it("gives editors the members only", async () => {
    const ben = await join("ben@example.org", "editor", 1);
    await f.invitations.replace({ weddingId, email: "new@example.org", role: "editor", invitedBy: anna.id, expiresAt: new Date(Date.now() + 86_400_000), tokenHash: "h" });
    const view = await new ListMembers(f.deps).execute(ben.id, weddingId);
    expect(view).toMatchObject({ canManage: false, invitations: [], contactUserId: anna.id });
    expect(view.members).toHaveLength(2);
  });

  it("is not available to strangers", async () => {
    const eve = await f.users.create("eve@example.org");
    await expect(new ListMembers(f.deps).execute(eve.id, weddingId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("invitations", () => {
  const invite = (email = "carla@example.org", role = "editor", by = anna.id) => new InviteMember(f.deps).execute(by, weddingId, { email, role });
  const accept = (token: string, currentUserId: string | null = null) => new AcceptInvitation(f.deps).execute({ token, currentUserId });
  /** The token from the link in the last invitation mail. */
  const lastToken = () => new URL(/http\S+/.exec(f.mailer.sent.at(-1)!.text)![0]).searchParams.get("token")!;

  it("sends one mail to the address with the link and the inviter's name", async () => {
    await f.users.updateFirstName(anna.id, "Anna");
    await invite(" Carla@Example.org ");
    expect(f.mailer.sent).toHaveLength(1);
    expect(f.mailer.sent[0]!.to).toBe("carla@example.org");
    expect(f.mailer.sent[0]!.text).toContain("http://localhost:3000/einladung?token=");
    expect(f.mailer.sent[0]!.text).toContain("Anna");
    expect(f.mailer.sent[0]!.text).toContain("Anna & Ben");
    const pending = f.invitations.invitations[0]!;
    expect(pending.tokenHash).toBe(f.tokens.hash(lastToken()));
    expect(pending.tokenHash).not.toBe(lastToken());
  });

  it("names the inviter by email when they have no first name", async () => {
    await invite();
    expect(f.mailer.sent[0]!.text).toContain("anna@example.org");
  });

  it("replaces a pending invitation for the same address", async () => {
    await invite();
    const first = lastToken();
    await invite("carla@example.org", "admin");
    expect(f.invitations.invitations).toHaveLength(1);
    await expect(accept(first)).rejects.toBeInstanceOf(InvalidTokenError);
    const { user } = await accept(lastToken());
    expect(await f.weddings.roleOf(weddingId, user.id)).toBe("admin");
  });

  it("is admin only", async () => {
    const ben = await join("ben@example.org", "editor", 1);
    await expect(invite("carla@example.org", "editor", ben.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(f.mailer.sent).toHaveLength(0);
  });

  it("validates the address and the role", async () => {
    await expect(invite("no-address")).rejects.toEqual(new ValidationError({ email: "invalid_email" }));
    await expect(invite("carla@example.org", "owner")).rejects.toEqual(new ValidationError({ role: "invalid_role" }));
  });

  it("refuses someone who already is a member", async () => {
    await join("ben@example.org", "editor", 1);
    await expect(invite("Ben@example.org")).rejects.toEqual(new ValidationError({ email: "already_member" }));
  });

  it("limits invitations to 20 an hour per user", async () => {
    for (let i = 0; i < 20; i++) await invite(`guest${i}@example.org`);
    await expect(invite("one-more@example.org")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("creates the user, an editor membership and a session when accepted without a session", async () => {
    const { weddingId: id } = await invite();
    const result = await accept(lastToken());
    expect(id).toBe(weddingId);
    expect(result.weddingId).toBe(weddingId);
    expect(result.user.email).toBe("carla@example.org");
    expect(result.needsProfile).toBe(true);
    expect(await f.weddings.roleOf(weddingId, result.user.id)).toBe("editor");
    expect(await f.deps.sessions.findByHash(f.tokens.hash(result.sessionToken))).toMatchObject({ userId: result.user.id });
  });

  it("works once", async () => {
    await invite();
    const token = lastToken();
    await accept(token);
    await expect(accept(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("expires after 14 days", async () => {
    await invite();
    f.clock.current = new Date(f.clock.current.getTime() + INVITATION_TTL_MS);
    await expect(accept(lastToken())).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("can be withdrawn by an admin", async () => {
    const invitation = await invite();
    await new WithdrawInvitation(f.deps).execute(anna.id, weddingId, invitation.id);
    await expect(accept(lastToken())).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("cannot be withdrawn by an editor or through another wedding", async () => {
    const invitation = await invite();
    const ben = await join("ben@example.org", "editor", 1);
    await expect(new WithdrawInvitation(f.deps).execute(ben.id, weddingId, invitation.id)).rejects.toBeInstanceOf(NotFoundError);
    const other = await new CreateWedding(f.deps).execute(ben.id, { title: "Ben & Dora", hasDate: false });
    await expect(new WithdrawInvitation(f.deps).execute(ben.id, other.id, invitation.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(f.invitations.invitations).toHaveLength(1);
  });

  it("is not accepted by a different logged-in account, and still works for the invited address", async () => {
    const ben = await f.users.create("ben@example.org");
    await invite();
    const token = lastToken();
    await expect(accept(token, ben.id)).rejects.toEqual(new ValidationError({ _: "other_account" }));
    expect(await f.weddings.roleOf(weddingId, ben.id)).toBeNull();
    const { user } = await accept(token);
    expect(user.email).toBe("carla@example.org");
    expect(await f.weddings.roleOf(weddingId, user.id)).toBe("editor");
  });

  it("is accepted by the invited address's existing account while logged in", async () => {
    const carla = await f.users.create("carla@example.org");
    await invite();
    const { user } = await accept(lastToken(), carla.id);
    expect(user.id).toBe(carla.id);
    expect(await f.weddings.roleOf(weddingId, carla.id)).toBe("editor");
  });
});
