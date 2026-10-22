import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DeleteAccount, ExportAccount } from "@/application/account";
import type { Deps } from "@/application/deps";
import { CreateWedding } from "@/application/weddings";
import { cardDeliveries, cardOpens, cards, householdVersions, households, weddingEvents } from "@/infrastructure/db/schema";
import { createCardTexts } from "@/infrastructure/mail/card-templates";
import { createSiteTexts } from "@/infrastructure/site-texts";
import { FflateArchiveWriter } from "@/infrastructure/archive/zip";
import { FflateSpreadsheets } from "@/infrastructure/spreadsheets";
import { DrizzleMagicLinkRepository, DrizzleSessionRepository, PostgresRateLimiter } from "@/infrastructure/repositories/auth";
import { DrizzleBillingRepository } from "@/infrastructure/repositories/billing";
import { DrizzleCardRepository } from "@/infrastructure/repositories/cards";
import { DrizzleGuestRepository } from "@/infrastructure/repositories/guests";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { DrizzleWeddingRepository } from "@/infrastructure/repositories/weddings";
import { LocalFileStorage } from "@/infrastructure/storage/local";
import { cryptoTokens, systemClock } from "@/infrastructure/system";
import { FakeThemes } from "../fakes";
import { setupTestDatabase } from "./db";

const db = setupTestDatabase();

/** Real repositories, real local storage and the real ZIP writer: what the app uses in production. */
async function realDeps() {
  const dir = await mkdtemp(path.join(tmpdir(), "traureise-account-"));
  const deps = {
    users: new DrizzleUserRepository(db),
    magicLinks: new DrizzleMagicLinkRepository(db),
    sessions: new DrizzleSessionRepository(db),
    rateLimiter: new PostgresRateLimiter(db),
    weddings: new DrizzleWeddingRepository(db),
    websites: new DrizzleWebsiteRepository(db),
    uploads: new DrizzleUploadRepository(db),
    storage: new LocalFileStorage(dir),
    billingRepo: new DrizzleBillingRepository(db),
    guests: new DrizzleGuestRepository(db),
    cards: new DrizzleCardRepository(db),
    archive: new FflateArchiveWriter(),
    spreadsheets: new FflateSpreadsheets(),
    clock: systemClock,
    tokens: cryptoTokens,
    themes: new FakeThemes(),
    cardTexts: createCardTexts(),
    siteTexts: createSiteTexts(),
  } as unknown as Deps;
  return { deps, dir };
}

async function seed(deps: Deps, email: string) {
  const user = await deps.users.create(email);
  const wedding = await new CreateWedding(deps).execute(user.id, { title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12" });
  const [website] = await deps.websites.listByWedding(wedding.id);
  const key = `${cryptoTokens.generate()}.webp`;
  await deps.storage.put(key, new Uint8Array([9, 8, 7]), "image/webp");
  await deps.uploads.create({ key, ownerId: user.id, weddingId: wedding.id, contentType: "image/webp", size: 3 });
  await deps.websites.update(website!.id, { coverImageKey: key });
  const faqs = (await deps.websites.listSections(website!.id)).at(-1)!;
  await deps.websites.addBlock(website!.id, faqs.id, { type: "faq", question: "Dresscode?", answer: "Sommerlich", imageKey: null });
  const household = await deps.guests.createHousehold(wedding.id, { name: "Weber", invitedEventIds: null, personalLine: "", people: [{ id: null, name: "Eva", isChild: false, email: "weber@example.org" }] }, (id) => `hash-${id}`);
  const [card] = await deps.cards.listByWedding(wedding.id);
  await deps.cards.markShared(household.id, "saveTheDate", "link", new Date());
  await deps.cards.markOpened(card!.id, household.id, new Date());
  await deps.guests.assign(household.id, "website", { websiteId: website!.id });
  await deps.sessions.create({ userId: user.id, tokenHash: `session-${email}`, expiresAt: new Date(Date.now() + 60_000) });
  await deps.magicLinks.create({ email, tokenHash: `link-${email}`, expiresAt: new Date(Date.now() + 60_000) });
  await deps.rateLimiter.hit(`magic-link:email:${email}`, 5, 60_000, new Date());
  await deps.billingRepo.applyEvent(`evt-${email}`, {
    kind: "grant",
    weddingId: wedding.id,
    tier: "rsvp",
    purchaseRef: `ord-${email}`,
    provider: "creem",
    validUntil: new Date("2028-06-13T00:00:00Z"),
  });
  return { user, wedding, website: website!, key };
}

describe("account export", () => {
  it("writes a ZIP with data.json and the stored images", async () => {
    const { deps } = await realDeps();
    const { user, wedding, website, key } = await seed(deps, "anna@example.org");
    const { bytes } = await new ExportAccount(deps).execute(user.id);

    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(["data.json", `images/${key}`]);
    expect(files[`images/${key}`]).toEqual(new Uint8Array([9, 8, 7]));
    const data = JSON.parse(new TextDecoder().decode(files["data.json"]));
    expect(data.account.email).toBe("anna@example.org");
    expect(data.weddings[0]).toMatchObject({ id: wedding.id, purchases: [expect.objectContaining({ tier: "rsvp" })] });
    expect(data.weddings[0].websites[0]).toMatchObject({ id: website.id, coverImage: `images/${key}` });
    const sections = data.weddings[0].websites[0].sections;
    expect(sections.map((s: { title: string }) => s.title)).toEqual([
      "Unsere Geschichte",
      "Tagesablauf",
      "Anreise",
      "Empfehlungen",
      "Geschenkideen",
      "Hochzeitsgesellschaft",
      "Galerie",
      "Häufige Fragen",
    ]);
    expect(sections.at(-1).blocks[0].data.question).toBe("Dresscode?");
    expect(data.weddings[0].websites[0]).not.toHaveProperty("hiddenEventIds");
    expect(data.weddings[0].cards).toHaveLength(4);
    expect(data.weddings[0].deliveries).toMatchObject([{ household: "Weber", kind: "saveTheDate" }]);
    expect(data.weddings[0].opens).toHaveLength(1);
    expect(data.weddings[0].guests.versions).toMatchObject([{ household: "Weber", item: "website" }]);
  });
});

describe("account deletion", () => {
  it("removes every row and every stored file of the user, and nothing of anyone else", async () => {
    const { deps, dir } = await realDeps();
    const anna = await seed(deps, "anna@example.org");
    const ben = await seed(deps, "ben@example.org");

    await new DeleteAccount(deps).execute(anna.user.id, "anna@example.org");

    expect(await deps.users.findById(anna.user.id)).toBeNull();
    expect(await deps.websites.findById(anna.website.id)).toBeNull();
    expect(await deps.websites.listBlocks(anna.website.id)).toEqual([]);
    expect(await deps.websites.listSections(anna.website.id)).toEqual([]);
    expect(await deps.uploads.listByOwner(anna.user.id)).toEqual([]);
    expect(await deps.billingRepo.listByWedding(anna.wedding.id)).toEqual([]);
    expect(await deps.weddings.findById(anna.wedding.id)).toBeNull();
    // Guest data and everything that hangs off it: only Ben's rows are left.
    for (const table of [households, cards, cardDeliveries, cardOpens, householdVersions]) expect(await db.$count(table)).toBe(table === cards ? 4 : 1);
    expect(await db.$count(weddingEvents)).toBe(0);
    expect(await deps.sessions.findByHash("session-anna@example.org")).toBeNull();
    expect(await deps.magicLinks.findByHash("link-anna@example.org")).toBeNull();
    expect(await readdir(dir)).toEqual([ben.key]);

    // Ben is untouched, and Anna's email address starts over with a fresh rate limit.
    expect(await deps.websites.findById(ben.website.id)).not.toBeNull();
    expect(await deps.sessions.findByHash("session-ben@example.org")).not.toBeNull();
    expect(await deps.rateLimiter.hit("magic-link:email:anna@example.org", 1, 60_000, new Date())).toBe(true);
    expect(await deps.rateLimiter.hit("magic-link:email:ben@example.org", 1, 60_000, new Date())).toBe(false);
  });
});
