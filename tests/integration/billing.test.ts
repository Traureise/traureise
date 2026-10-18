import { describe, expect, it } from "vitest";
import type { Section } from "@/application/ports";
import { SECTION_KINDS } from "@/domain/sections";
import { DrizzleBillingRepository } from "@/infrastructure/repositories/billing";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { setupTestDatabase } from "./db";

const db = setupTestDatabase();
const billing = new DrizzleBillingRepository(db);
const sections: Section[] = SECTION_KINDS.map((kind) => ({ kind, title: null, visible: true, body: "" }));

async function seed() {
  const user = await new DrizzleUserRepository(db).create("anna@example.org");
  const website = await new DrizzleWebsiteRepository(db).create(
    { ownerId: user.id, slug: "anna-und-ben", title: "Anna & Ben", weddingDate: null, themeId: "salbei", timezone: "Europe/Berlin" },
    sections,
  );
  return { user, website };
}

const grant = (websiteId: string, purchaseRef = "ord_1") => ({
  kind: "grant" as const,
  websiteId,
  tier: "rsvp" as const,
  purchaseRef,
  provider: "creem",
  validUntil: new Date("2028-06-13T00:00:00Z"),
});

describe("DrizzleBillingRepository", () => {
  it("grants, lists by website and owner, and handles each event once", async () => {
    const { user, website } = await seed();
    expect(await billing.applyEvent("evt_1", grant(website.id))).toBe("applied");
    expect(await billing.applyEvent("evt_1", grant(website.id))).toBe("duplicate");
    const [entitlement] = await billing.listByWebsite(website.id);
    expect(entitlement).toMatchObject({ tier: "rsvp", purchaseRef: "ord_1", provider: "creem", revokedAt: null, websiteId: website.id });
    expect(await billing.listByOwner(user.id)).toHaveLength(1);
  });

  it("revokes by purchase reference and never grants the same purchase again", async () => {
    const { website } = await seed();
    await billing.applyEvent("evt_1", grant(website.id));
    const at = new Date("2026-10-20T10:00:00Z");
    await billing.applyEvent("evt_2", { kind: "revoke", purchaseRef: "ord_1", at });
    await billing.applyEvent("evt_3", grant(website.id));
    expect((await billing.listByWebsite(website.id)).map((e) => e.revokedAt)).toEqual([at]);
  });

  it("records events that change nothing, and handles concurrent deliveries once", async () => {
    const { website } = await seed();
    expect(await billing.applyEvent("evt_0", { kind: "none" })).toBe("applied");
    expect(await billing.applyEvent("evt_0", { kind: "none" })).toBe("duplicate");
    const results = await Promise.all([billing.applyEvent("evt_x", grant(website.id, "ord_x")), billing.applyEvent("evt_x", grant(website.id, "ord_x"))]);
    expect(results.sort()).toEqual(["applied", "duplicate"]);
    expect(await billing.listByWebsite(website.id)).toHaveLength(1);
  });

  it("rolls back the event id when the change fails, so the provider's retry is applied", async () => {
    await expect(billing.applyEvent("evt_bad", grant("00000000-0000-0000-0000-000000000000"))).rejects.toThrow();
    const { website } = await seed();
    expect(await billing.applyEvent("evt_bad", grant(website.id))).toBe("applied");
  });
});
