import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import { ChangeMemberRole, LeaveWedding, ListMembers, RemoveMember, SetContactPerson } from "@/application/members";
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
