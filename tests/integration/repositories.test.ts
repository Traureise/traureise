import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Section } from "@/application/ports";
import { SECTION_KINDS } from "@/domain/sections";
import { magicLinkTokens, rateLimitHits, sectionItems, sessions, uploads, users, websiteSections } from "@/infrastructure/db/schema";
import { DrizzleMagicLinkRepository, DrizzleSessionRepository, PostgresRateLimiter } from "@/infrastructure/repositories/auth";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { setupTestDatabase } from "./db";

const db = setupTestDatabase();
const userRepo = new DrizzleUserRepository(db);
const websiteRepo = new DrizzleWebsiteRepository(db);
const sections: Section[] = SECTION_KINDS.map((kind) => ({ kind, title: null, visible: true, body: "" }));

async function seedWebsite(email = "anna@example.org", slug = "anna-und-ben") {
  const user = await userRepo.create(email);
  const website = await websiteRepo.create(
    { ownerId: user.id, slug, title: "Anna & Ben", weddingDate: "2027-06-12", themeId: "salbei", timezone: "Europe/Berlin" },
    sections,
  );
  return { user, website };
}

describe("DrizzleUserRepository", () => {
  it("creates, finds and updates users; creating twice returns the same user", async () => {
    const user = await userRepo.create("anna@example.org");
    expect((await userRepo.create("anna@example.org")).id).toBe(user.id);
    await userRepo.updateFirstName(user.id, "Anna");
    expect(await userRepo.findByEmail("anna@example.org")).toMatchObject({ id: user.id, firstName: "Anna" });
    expect(await userRepo.findById(user.id)).toMatchObject({ email: "anna@example.org" });
    expect(await userRepo.findByEmail("nobody@example.org")).toBeNull();
  });
});

describe("magic links and sessions", () => {
  it("lets exactly one concurrent verification use a token", async () => {
    const links = new DrizzleMagicLinkRepository(db);
    await links.create({ email: "anna@example.org", tokenHash: "h1", expiresAt: new Date(Date.now() + 60_000) });
    const link = (await links.findByHash("h1"))!;
    const results = await Promise.all([links.markUsed(link.id, new Date()), links.markUsed(link.id, new Date())]);
    expect(results.sort()).toEqual([false, true]);
    expect((await links.findByHash("h1"))!.usedAt).toBeInstanceOf(Date);
    expect(await links.findByHash("unknown")).toBeNull();
  });

  it("stores, finds and deletes sessions", async () => {
    const sessionRepo = new DrizzleSessionRepository(db);
    const user = await userRepo.create("anna@example.org");
    const expiresAt = new Date("2026-11-17T10:00:00Z");
    await sessionRepo.create({ userId: user.id, tokenHash: "s1", expiresAt });
    expect(await sessionRepo.findByHash("s1")).toMatchObject({ userId: user.id, expiresAt });
    await sessionRepo.deleteByHash("s1");
    expect(await sessionRepo.findByHash("s1")).toBeNull();
  });

  it("counts rate-limit hits per key inside the window", async () => {
    const limiter = new PostgresRateLimiter(db);
    const t0 = new Date("2026-10-18T10:00:00Z");
    expect(await limiter.hit("k", 2, 60_000, t0)).toBe(true);
    expect(await limiter.hit("k", 2, 60_000, t0)).toBe(true);
    expect(await limiter.hit("k", 2, 60_000, t0)).toBe(false);
    expect(await limiter.hit("other", 2, 60_000, t0)).toBe(true);
    expect(await limiter.hit("k", 2, 60_000, new Date(t0.getTime() + 60_001))).toBe(true);
  });

  it("keeps no expired personal data around", async () => {
    const limiter = new PostgresRateLimiter(db);
    const t0 = new Date("2026-10-18T10:00:00Z");
    await limiter.hit("magic-link:email:old@example.org", 5, 60_000, t0);
    await limiter.hit("magic-link:ip:10.0.0.1", 5, 60_000, new Date(t0.getTime() + 120_000));
    const keys = (await db.select().from(rateLimitHits)).map((r) => r.key);
    expect(keys).toEqual(["magic-link:ip:10.0.0.1"]);

    const links = new DrizzleMagicLinkRepository(db);
    await links.create({ email: "old@example.org", tokenHash: "expired", expiresAt: new Date(Date.now() - 1000) });
    await links.create({ email: "new@example.org", tokenHash: "fresh", expiresAt: new Date(Date.now() + 60_000) });
    expect((await db.select().from(magicLinkTokens)).map((r) => r.email)).toEqual(["new@example.org"]);

    const sessionRepo = new DrizzleSessionRepository(db);
    const user = await userRepo.create("anna@example.org");
    await sessionRepo.create({ userId: user.id, tokenHash: "old", expiresAt: new Date(Date.now() - 1000) });
    await sessionRepo.create({ userId: user.id, tokenHash: "new", expiresAt: new Date(Date.now() + 60_000) });
    expect((await db.select().from(sessions)).map((r) => r.tokenHash)).toEqual(["new"]);
  });
});

describe("DrizzleWebsiteRepository", () => {
  it("creates a website with all sections and finds it by id, slug and owner", async () => {
    const { user, website } = await seedWebsite();
    expect(website).toMatchObject({ slug: "anna-und-ben", weddingDate: "2027-06-12", showCountdown: false, paletteId: null });
    expect(await websiteRepo.findBySlug("anna-und-ben")).toMatchObject({ id: website.id });
    expect((await websiteRepo.listByOwner(user.id)).map((w) => w.id)).toEqual([website.id]);
    expect((await websiteRepo.listSections(website.id)).map((s) => s.kind).sort()).toEqual([...SECTION_KINDS].sort());
    expect(await websiteRepo.findById("not-a-uuid")).toBeNull();
  });

  it("enforces unique slugs and reports them as taken", async () => {
    const { website } = await seedWebsite();
    expect(await websiteRepo.slugTaken("anna-und-ben")).toBe(true);
    expect(await websiteRepo.slugTaken("anna-und-ben", website.id)).toBe(false);
    await expect(seedWebsite("ben@example.org", "anna-und-ben")).rejects.toThrow();
  });

  it("updates website fields and sections", async () => {
    const { website } = await seedWebsite();
    const updated = await websiteRepo.update(website.id, { location: "Beispielstadt", weddingDate: null, showCountdown: true });
    expect(updated).toMatchObject({ location: "Beispielstadt", weddingDate: null, showCountdown: true });
    await websiteRepo.updateSection(website.id, "faqs", { title: "Fragen", visible: false });
    expect((await websiteRepo.listSections(website.id)).find((s) => s.kind === "faqs")).toMatchObject({ title: "Fragen", visible: false });
  });

  it("appends, reorders, updates and deletes items per section", async () => {
    const { website } = await seedWebsite();
    const a = await websiteRepo.addItem(website.id, "faqs", { question: "A", answer: "1", imageKey: null });
    const b = await websiteRepo.addItem(website.id, "faqs", { question: "B", answer: "2", imageKey: null });
    const other = await websiteRepo.addItem(website.id, "registry", { name: "Kasse", url: "https://example.org", description: "" });
    expect([a.position, b.position, other.position]).toEqual([0, 1, 0]);

    await websiteRepo.setItemOrder(website.id, "faqs", [b.id, a.id]);
    const faqs = (await websiteRepo.listItems(website.id)).filter((i) => i.kind === "faqs");
    expect(faqs.map((i) => i.id)).toEqual([b.id, a.id]);

    await websiteRepo.updateItem(a.id, { question: "A2", answer: "1", imageKey: null });
    expect((await websiteRepo.findItem(website.id, a.id))?.data).toMatchObject({ question: "A2" });
    await websiteRepo.deleteItem(a.id);
    expect(await websiteRepo.findItem(website.id, a.id)).toBeNull();
    expect(await websiteRepo.findItem(website.id, "nope")).toBeNull();
  });

  it("deletes a website with its sections and items", async () => {
    const { website } = await seedWebsite();
    await websiteRepo.addItem(website.id, "faqs", { question: "A", answer: "1", imageKey: null });
    await websiteRepo.delete(website.id);
    expect(await websiteRepo.findById(website.id)).toBeNull();
    expect(await db.select().from(websiteSections).where(eq(websiteSections.websiteId, website.id))).toHaveLength(0);
    expect(await db.select().from(sectionItems).where(eq(sectionItems.websiteId, website.id))).toHaveLength(0);
  });
});

describe("DrizzleUploadRepository and cascades", () => {
  it("tracks uploads per website", async () => {
    const repo = new DrizzleUploadRepository(db);
    const { user, website } = await seedWebsite();
    await repo.create({ key: "k1.webp", ownerId: user.id, websiteId: website.id, contentType: "image/webp", size: 3 });
    expect(await repo.belongsToWebsite("k1.webp", website.id)).toBe(true);
    expect(await repo.listKeysByWebsite(website.id)).toEqual(["k1.webp"]);
    await repo.delete("k1.webp");
    expect(await repo.belongsToWebsite("k1.webp", website.id)).toBe(false);
  });

  it("removes all of a user's data when the user is deleted", async () => {
    const { user, website } = await seedWebsite();
    await new DrizzleUploadRepository(db).create({ key: "k1.webp", ownerId: user.id, websiteId: website.id, contentType: "image/webp", size: 3 });
    await new DrizzleSessionRepository(db).create({ userId: user.id, tokenHash: "s", expiresAt: new Date() });
    await db.delete(users).where(eq(users.id, user.id));
    const counts = await db.execute<{ n: number }>(
      sql`select (select count(*) from websites) + (select count(*) from website_sections) + (select count(*) from sessions) + (select count(*) from uploads) as n`,
    );
    expect(Number(counts[0]!.n)).toBe(0);
    expect(await db.select().from(uploads)).toHaveLength(0);
  });
});
