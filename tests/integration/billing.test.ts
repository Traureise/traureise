import { describe, expect, it } from "vitest";
import { DrizzleBillingRepository } from "@/infrastructure/repositories/billing";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWeddingRepository } from "@/infrastructure/repositories/weddings";
import { seedWedding, setupTestDatabase } from "./db";

const db = setupTestDatabase();
const billing = new DrizzleBillingRepository(db);

async function seed() {
  const { user, wedding } = await seedWedding(db, "anna@example.org", "anna-und-ben", null);
  return { user, website: wedding };
}

const grant = (weddingId: string, purchaseRef = "ord_1", purchasedBy: string | null = null) => ({
  kind: "grant" as const,
  purchasedBy,
  weddingId,
  tier: "rsvp" as const,
  purchaseRef,
  provider: "creem",
  validUntil: new Date("2028-06-13T00:00:00Z"),
});

describe("DrizzleBillingRepository", () => {
  it("grants, lists by wedding and for admins, and handles each event once", async () => {
    const { user, website } = await seed();
    expect(await billing.applyEvent("evt_1", grant(website.id))).toBe("applied");
    expect(await billing.applyEvent("evt_1", grant(website.id))).toBe("duplicate");
    const [entitlement] = await billing.listByWedding(website.id);
    expect(entitlement).toMatchObject({ tier: "rsvp", purchaseRef: "ord_1", provider: "creem", revokedAt: null, weddingId: website.id });
    expect((await billing.listForAdmin(user.id)).map((e) => e.weddingId)).toEqual([website.id]);
  });

  it("revokes by purchase reference and never grants the same purchase again", async () => {
    const { website } = await seed();
    await billing.applyEvent("evt_1", grant(website.id));
    const at = new Date("2026-10-20T10:00:00Z");
    await billing.applyEvent("evt_2", { kind: "revoke", purchaseRef: "ord_1", at });
    await billing.applyEvent("evt_3", grant(website.id));
    expect((await billing.listByWedding(website.id)).map((e) => e.revokedAt)).toEqual([at]);
  });

  it("records events that change nothing, and handles concurrent deliveries once", async () => {
    const { website } = await seed();
    expect(await billing.applyEvent("evt_0", { kind: "none" })).toBe("applied");
    expect(await billing.applyEvent("evt_0", { kind: "none" })).toBe("duplicate");
    const results = await Promise.all([billing.applyEvent("evt_x", grant(website.id, "ord_x")), billing.applyEvent("evt_x", grant(website.id, "ord_x"))]);
    expect(results.sort()).toEqual(["applied", "duplicate"]);
    expect(await billing.listByWedding(website.id)).toHaveLength(1);
  });

  it("rolls back the event id when the change fails, so the provider's retry is applied", async () => {
    await expect(billing.applyEvent("evt_bad", grant("00000000-0000-0000-0000-000000000000"))).rejects.toThrow();
    const { website } = await seed();
    expect(await billing.applyEvent("evt_bad", grant(website.id))).toBe("applied");
  });

  it("stores who bought a package; admins list it, editors do not, and it outlives the buyer's account", async () => {
    const { user, website } = await seed();
    const users = new DrizzleUserRepository(db);
    const weddings = new DrizzleWeddingRepository(db);
    const ben = await users.create("ben@example.org");
    const carla = await users.create("carla@example.org");
    await weddings.addMember(website.id, ben.id, "admin");
    await weddings.addMember(website.id, carla.id, "editor");
    await billing.applyEvent("evt_1", grant(website.id, "ord_1", user.id));
    expect((await billing.listForAdmin(ben.id)).map((e) => e.purchasedBy)).toEqual([user.id]);
    expect(await billing.listForAdmin(carla.id)).toEqual([]);
    await users.delete(user.id);
    expect((await billing.listForAdmin(ben.id)).map((e) => e.purchasedBy)).toEqual([null]);
  });
});
