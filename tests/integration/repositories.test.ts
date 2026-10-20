import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { NewSection } from "@/application/ports";
import { parseEvent, type BlockData } from "@/domain/sections";
import { magicLinkTokens, rateLimitHits, sectionBlocks, sessions, uploads, users, websiteSections } from "@/infrastructure/db/schema";
import { DrizzleMagicLinkRepository, DrizzleSessionRepository, PostgresRateLimiter } from "@/infrastructure/repositories/auth";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { DrizzleWeddingRepository } from "@/infrastructure/repositories/weddings";
import { seedWedding, setupTestDatabase } from "./db";

const db = setupTestDatabase();
const userRepo = new DrizzleUserRepository(db);
const websiteRepo = new DrizzleWebsiteRepository(db);
const weddingRepo = new DrizzleWeddingRepository(db);
const seedWebsite = (email?: string, slug?: string, sections?: NewSection[]) => seedWedding(db, email, slug, undefined, sections);

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

describe("DrizzleWeddingRepository", () => {
  it("creates a wedding and finds it by id, slug and owner", async () => {
    const { user, wedding } = await seedWebsite();
    expect(wedding).toMatchObject({ slug: "anna-und-ben", title: "Anna & Ben", weddingDate: "2027-06-12", location: null, lastOpenedAt: null });
    expect(await weddingRepo.findBySlug("anna-und-ben")).toMatchObject({ id: wedding.id });
    expect((await weddingRepo.listByOwner(user.id)).map((w) => w.id)).toEqual([wedding.id]);
    expect(await weddingRepo.findById("not-a-uuid")).toBeNull();
    const at = new Date("2020-01-01T00:00:00Z");
    expect(await weddingRepo.update(wedding.id, { location: "Kempten", weddingDate: null })).toMatchObject({ location: "Kempten", weddingDate: null });
    await weddingRepo.markUsed(wedding.id);
    expect((await weddingRepo.findById(wedding.id))!.lastOpenedAt!.getTime()).toBeGreaterThan(at.getTime());
  });

  it("reports who uses a slug: weddings and website versions share one namespace", async () => {
    const { wedding, website } = await seedWebsite();
    expect(await weddingRepo.slugOwners("anna-und-ben")).toEqual({ weddingIds: [wedding.id], websites: [{ id: website.id, weddingId: wedding.id }] });
    expect(await weddingRepo.slugOwners("frei")).toEqual({ weddingIds: [], websites: [] });
    await expect(seedWebsite("ben@example.org", "anna-und-ben")).rejects.toThrow();
  });

  it("keeps the schedule as the wedding's events, always chronological", async () => {
    const { wedding } = await seedWebsite();
    const a = await weddingRepo.addEvent(wedding.id, event("Feier", "2027-06-12", "18:00"));
    const b = await weddingRepo.addEvent(wedding.id, event("Vorabend", "2027-06-11", "20:00"));
    expect((await weddingRepo.listEvents(wedding.id)).map((e) => e.id)).toEqual([b.id, a.id]);
    await weddingRepo.updateEvent(a.id, event("Standesamt", "2027-06-10", "10:00"));
    expect((await weddingRepo.listEvents(wedding.id)).map((e) => e.data.name)).toEqual(["Standesamt", "Vorabend"]);
    expect((await weddingRepo.findEvent(wedding.id, a.id))?.data.name).toBe("Standesamt");
    await weddingRepo.deleteEvent(a.id);
    expect(await weddingRepo.findEvent(wedding.id, a.id)).toBeNull();
    expect(await weddingRepo.findEvent(wedding.id, "nope")).toBeNull();
  });

  it("deletes the wedding with its website versions, sections and blocks", async () => {
    const { wedding, website } = await seedWebsite();
    const [section] = await websiteRepo.listSections(website.id);
    await websiteRepo.addBlock(website.id, section!.id, faq("A"));
    await weddingRepo.delete(wedding.id);
    expect(await websiteRepo.findById(website.id)).toBeNull();
    expect(await db.select().from(websiteSections).where(eq(websiteSections.websiteId, website.id))).toHaveLength(0);
    expect(await db.select().from(sectionBlocks).where(eq(sectionBlocks.websiteId, website.id))).toHaveLength(0);
  });
});

function event(name: string, startDate = "2027-06-12", startTime = "14:00") {
  const parsed = parseEvent({ eventType: "ceremony", name, startDate, startTime });
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
}

const faq = (question: string): BlockData => ({ type: "faq", question, answer: "1", imageKey: null });
const text = (value: string): BlockData => ({ type: "text", text: value });

describe("DrizzleWebsiteRepository", () => {
  it("creates a website version with its sections and blocks and lists a wedding's versions first first", async () => {
    const { wedding, website } = await seedWebsite();
    expect(website).toMatchObject({ slug: "anna-und-ben", label: "Standard", position: 0, published: false, showCountdown: false, paletteId: null });
    expect(website).not.toHaveProperty("hiddenEventIds");
    expect(await websiteRepo.findBySlug("anna-und-ben")).toMatchObject({ id: website.id });
    const copy = { ...website, id: undefined, createdAt: undefined, updatedAt: undefined };
    const friends = await websiteRepo.create({ ...copy, label: "Freunde", position: 1, slug: "anna-und-ben-freunde" }, [
      { title: "Hallo", visible: true, suggestedType: null, blocks: [] },
      { title: "Fragen", visible: false, suggestedType: "faq", blocks: [faq("A"), faq("B")] },
    ]);
    expect((await websiteRepo.listByWedding(wedding.id)).map((w) => w.label)).toEqual(["Standard", "Freunde"]);
    const sections = await websiteRepo.listSections(friends.id);
    expect(sections.map((s) => [s.position, s.title, s.visible, s.suggestedType])).toEqual([
      [0, "Hallo", true, null],
      [1, "Fragen", false, "faq"],
    ]);
    const blocks = await websiteRepo.listBlocks(friends.id);
    expect(blocks.map((b) => [b.sectionId, b.position, b.data])).toEqual([
      [sections[1]!.id, 0, faq("A")],
      [sections[1]!.id, 1, faq("B")],
    ]);
    expect(await websiteRepo.findById("not-a-uuid")).toBeNull();
    await expect(websiteRepo.create({ ...copy, position: 2 }, [])).rejects.toThrow();
  });

  it("updates website fields", async () => {
    const { website } = await seedWebsite();
    const updated = await websiteRepo.update(website.id, { welcomeMessage: "Hallo", published: true, showCountdown: true });
    expect(updated).toMatchObject({ welcomeMessage: "Hallo", published: true, showCountdown: true });
  });

  it("appends, renames, reorders and deletes sections; deleting one deletes its blocks", async () => {
    const { website } = await seedWebsite("anna@example.org", "anna-und-ben", []);
    const a = await websiteRepo.addSection(website.id, { title: "A", visible: true, suggestedType: null, blocks: [] });
    const b = await websiteRepo.addSection(website.id, { title: "B", visible: true, suggestedType: null, blocks: [text("b")] });
    const c = await websiteRepo.addSection(website.id, { title: "C", visible: true, suggestedType: "person", blocks: [] });
    expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);
    expect(c).toMatchObject({ title: "C", visible: true, suggestedType: "person" });

    await websiteRepo.updateSection(a.id, { title: "A2", visible: false });
    expect(await websiteRepo.findSection(website.id, a.id)).toMatchObject({ title: "A2", visible: false });
    await websiteRepo.setSectionOrder(website.id, [c.id, b.id, a.id]);
    expect((await websiteRepo.listSections(website.id)).map((s) => s.title)).toEqual(["C", "B", "A2"]);

    await websiteRepo.deleteSection(b.id);
    expect(await websiteRepo.findSection(website.id, b.id)).toBeNull();
    expect(await websiteRepo.listBlocks(website.id)).toEqual([]);
    expect(await websiteRepo.findSection(website.id, "x")).toBeNull();
  });

  it("appends, updates, reorders and deletes blocks within a section", async () => {
    const { website } = await seedWebsite("anna@example.org", "anna-und-ben", []);
    const other = await seedWebsite("ben@example.org", "ben-und-cleo", []);
    const first = await websiteRepo.addSection(website.id, { title: "Eins", visible: true, suggestedType: null, blocks: [] });
    const second = await websiteRepo.addSection(website.id, { title: "Zwei", visible: true, suggestedType: null, blocks: [] });
    const late = await websiteRepo.addBlock(website.id, second.id, text("später"));
    const a = await websiteRepo.addBlock(website.id, first.id, faq("A"));
    const b = await websiteRepo.addBlock(website.id, first.id, faq("B"));
    expect([a.position, b.position, late.position]).toEqual([0, 1, 0]);
    expect((await websiteRepo.listBlocks(website.id)).map((x) => x.id)).toEqual([a.id, b.id, late.id]);

    await websiteRepo.setBlockOrder(first.id, [b.id, a.id]);
    expect((await websiteRepo.listBlocks(website.id)).map((x) => x.id)).toEqual([b.id, a.id, late.id]);
    await websiteRepo.updateBlock(a.id, faq("A2"));
    expect((await websiteRepo.findBlock(website.id, a.id))?.data).toMatchObject({ question: "A2" });
    expect(await websiteRepo.findBlock(other.website.id, a.id)).toBeNull();
    await websiteRepo.deleteBlock(a.id);
    expect(await websiteRepo.findBlock(website.id, a.id)).toBeNull();
    expect(await websiteRepo.findBlock(website.id, "nope")).toBeNull();
  });

  it("deleting an event deletes the blocks pointing to it in every website version, in one go", async () => {
    const { wedding, website } = await seedWebsite("anna@example.org", "anna-und-ben", []);
    const copy = { ...website, id: undefined, createdAt: undefined, updatedAt: undefined };
    const friends = await websiteRepo.create({ ...copy, label: "Freunde", position: 1, slug: "anna-und-ben-freunde" }, []);
    const e1 = await weddingRepo.addEvent(wedding.id, event("Brunch"));
    const e2 = await weddingRepo.addEvent(wedding.id, event("Feier"));
    for (const site of [website, friends]) {
      const section = await websiteRepo.addSection(site.id, { title: "Ablauf", visible: true, suggestedType: "event", blocks: [] });
      await websiteRepo.addBlock(site.id, section.id, { type: "event", eventId: e1.id });
      await websiteRepo.addBlock(site.id, section.id, { type: "event", eventId: null });
      await websiteRepo.addBlock(site.id, section.id, { type: "event", eventId: e2.id });
    }
    await weddingRepo.deleteEvent(e1.id);
    expect(await weddingRepo.findEvent(wedding.id, e1.id)).toBeNull();
    for (const site of [website, friends]) {
      expect((await websiteRepo.listBlocks(site.id)).map((x) => x.data)).toEqual([
        { type: "event", eventId: null },
        { type: "event", eventId: e2.id },
      ]);
    }
  });

  it("gives blocks and sections added at the same moment distinct positions", async () => {
    const { website } = await seedWebsite("anna@example.org", "anna-und-ben", []);
    const sections = await Promise.all(
      Array.from({ length: 4 }, (_, i) => websiteRepo.addSection(website.id, { title: `S${i}`, visible: true, suggestedType: null, blocks: [] })),
    );
    expect(sections.map((s) => s.position).sort()).toEqual([0, 1, 2, 3]);
    const blocks = await Promise.all(Array.from({ length: 4 }, (_, i) => websiteRepo.addBlock(website.id, sections[0]!.id, text(`B${i}`))));
    expect(blocks.map((b) => b.position).sort()).toEqual([0, 1, 2, 3]);
  });

  it("deletes a website version with its sections and blocks", async () => {
    const { website } = await seedWebsite();
    const [section] = await websiteRepo.listSections(website.id);
    await websiteRepo.addBlock(website.id, section!.id, faq("A"));
    await websiteRepo.delete(website.id);
    expect(await websiteRepo.findById(website.id)).toBeNull();
    expect(await db.select().from(websiteSections).where(eq(websiteSections.websiteId, website.id))).toHaveLength(0);
    expect(await db.select().from(sectionBlocks).where(eq(sectionBlocks.websiteId, website.id))).toHaveLength(0);
  });
});

describe("DrizzleUploadRepository and cascades", () => {
  it("tracks uploads per wedding", async () => {
    const repo = new DrizzleUploadRepository(db);
    const { user, wedding } = await seedWebsite();
    await repo.create({ key: "k1.webp", ownerId: user.id, weddingId: wedding.id, contentType: "image/webp", size: 3 });
    expect(await repo.belongsToWedding("k1.webp", wedding.id)).toBe(true);
    expect(await repo.listKeysByWedding(wedding.id)).toEqual(["k1.webp"]);
    await repo.delete("k1.webp");
    expect(await repo.belongsToWedding("k1.webp", wedding.id)).toBe(false);
  });

  it("removes all of a user's data when the user is deleted", async () => {
    const { user, wedding } = await seedWebsite();
    await new DrizzleUploadRepository(db).create({ key: "k1.webp", ownerId: user.id, weddingId: wedding.id, contentType: "image/webp", size: 3 });
    await new DrizzleSessionRepository(db).create({ userId: user.id, tokenHash: "s", expiresAt: new Date() });
    await db.delete(users).where(eq(users.id, user.id));
    const counts = await db.execute<{ n: number }>(
      sql`select (select count(*) from weddings) + (select count(*) from websites) + (select count(*) from website_sections) + (select count(*) from sessions) + (select count(*) from uploads) as n`,
    );
    expect(Number(counts[0]!.n)).toBe(0);
    expect(await db.select().from(uploads)).toHaveLength(0);
  });
});
