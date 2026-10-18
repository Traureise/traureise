import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DeleteAccount, ExportAccount } from "@/application/account";
import type { Deps } from "@/application/deps";
import type { Section } from "@/application/ports";
import { SECTION_KINDS } from "@/domain/sections";
import { FflateArchiveWriter } from "@/infrastructure/archive/zip";
import { DrizzleMagicLinkRepository, DrizzleSessionRepository, PostgresRateLimiter } from "@/infrastructure/repositories/auth";
import { DrizzleBillingRepository } from "@/infrastructure/repositories/billing";
import { DrizzleCardRepository } from "@/infrastructure/repositories/cards";
import { DrizzleGuestRepository } from "@/infrastructure/repositories/guests";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { LocalFileStorage } from "@/infrastructure/storage/local";
import { cryptoTokens, systemClock } from "@/infrastructure/system";
import { setupTestDatabase } from "./db";

const db = setupTestDatabase();
const sections: Section[] = SECTION_KINDS.map((kind) => ({ kind, title: null, visible: true, body: "" }));

/** Real repositories, real local storage and the real ZIP writer: what the app uses in production. */
async function realDeps() {
  const dir = await mkdtemp(path.join(tmpdir(), "traureise-account-"));
  const deps = {
    users: new DrizzleUserRepository(db),
    magicLinks: new DrizzleMagicLinkRepository(db),
    sessions: new DrizzleSessionRepository(db),
    rateLimiter: new PostgresRateLimiter(db),
    websites: new DrizzleWebsiteRepository(db),
    uploads: new DrizzleUploadRepository(db),
    storage: new LocalFileStorage(dir),
    billingRepo: new DrizzleBillingRepository(db),
    guests: new DrizzleGuestRepository(db),
    cards: new DrizzleCardRepository(db),
    archive: new FflateArchiveWriter(),
    clock: systemClock,
    tokens: cryptoTokens,
  } as unknown as Deps;
  return { deps, dir };
}

async function seed(deps: Deps, email: string) {
  const user = await deps.users.create(email);
  const website = await deps.websites.create(
    { ownerId: user.id, slug: email.split("@")[0]!, title: "Anna & Ben", weddingDate: "2027-06-12", themeId: "salbei", timezone: "Europe/Berlin" },
    sections,
  );
  const key = `${cryptoTokens.generate()}.webp`;
  await deps.storage.put(key, new Uint8Array([9, 8, 7]), "image/webp");
  await deps.uploads.create({ key, ownerId: user.id, websiteId: website.id, contentType: "image/webp", size: 3 });
  await deps.websites.update(website.id, { coverImageKey: key });
  await deps.websites.addItem(website.id, "faqs", { question: "Dresscode?", answer: "Sommerlich", imageKey: null });
  await deps.sessions.create({ userId: user.id, tokenHash: `session-${email}`, expiresAt: new Date(Date.now() + 60_000) });
  await deps.magicLinks.create({ email, tokenHash: `link-${email}`, expiresAt: new Date(Date.now() + 60_000) });
  await deps.rateLimiter.hit(`magic-link:email:${email}`, 5, 60_000, new Date());
  await deps.billingRepo.applyEvent(`evt-${email}`, {
    kind: "grant",
    websiteId: website.id,
    tier: "rsvp",
    purchaseRef: `ord-${email}`,
    provider: "creem",
    validUntil: new Date("2028-06-13T00:00:00Z"),
  });
  return { user, website, key };
}

describe("account export", () => {
  it("writes a ZIP with data.json and the stored images", async () => {
    const { deps } = await realDeps();
    const { user, website, key } = await seed(deps, "anna@example.org");
    const { bytes } = await new ExportAccount(deps).execute(user.id);

    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(["data.json", `images/${key}`]);
    expect(files[`images/${key}`]).toEqual(new Uint8Array([9, 8, 7]));
    const data = JSON.parse(new TextDecoder().decode(files["data.json"]));
    expect(data.account.email).toBe("anna@example.org");
    expect(data.websites[0]).toMatchObject({ id: website.id, coverImage: `images/${key}`, purchases: [expect.objectContaining({ tier: "rsvp" })] });
    expect(data.websites[0].items[0].data.question).toBe("Dresscode?");
    expect(data.websites[0].sections).toHaveLength(SECTION_KINDS.length);
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
    expect(await deps.websites.listItems(anna.website.id)).toEqual([]);
    expect(await deps.websites.listSections(anna.website.id)).toEqual([]);
    expect(await deps.uploads.listByOwner(anna.user.id)).toEqual([]);
    expect(await deps.billingRepo.listByWebsite(anna.website.id)).toEqual([]);
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
