import { beforeEach, describe, expect, it } from "vitest";
import { DeleteAccount, ExportAccount } from "@/application/account";
import { RequestMagicLink, VerifyMagicLink } from "@/application/auth";
import { ValidationError } from "@/application/errors";
import { AddEvent } from "@/application/schedule";
import { AddBlock } from "@/application/sections";
import { UploadImage } from "@/application/uploads";
import { AddVersion, AssignVersion } from "@/application/versions";
import { CreateWedding } from "@/application/weddings";
import { SaveHousehold } from "@/application/guests";
import { SetCoverImage } from "@/application/websites";
import { FakeArchive, JPEG, createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: string;

beforeEach(async () => {
  f = createFakes();
  const user = await f.users.create("anna@example.org");
  await f.users.updateFirstName(user.id, "Anna");
  anna = user.id;
});

async function seedWebsite(ownerId = anna) {
  const wedding = await new CreateWedding(f.deps).execute(ownerId, { title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12" });
  const [website] = await f.websites.listByWedding(wedding.id);
  const cover = await new UploadImage(f.deps).execute(ownerId, wedding.id, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
  await new SetCoverImage(f.deps).execute(ownerId, website!.id, cover);
  const sections = await f.websites.listSections(website!.id);
  await new AddBlock(f.deps).execute(ownerId, website!.id, sections[0]!.id, { type: "text", text: "Kennengelernt im Zug." });
  await new AddBlock(f.deps).execute(ownerId, website!.id, sections.at(-1)!.id, { type: "faq", question: "Dresscode?", answer: "Sommerlich" });
  await new AddEvent(f.deps).execute(ownerId, wedding.id, { eventType: "ceremony", name: "Trauung", startDate: "2027-06-12", startTime: "14:30" });
  return { wedding, website: website!, cover };
}

describe("ExportAccount", () => {
  it("exports account, weddings, website versions, sections with their blocks, events and every uploaded image", async () => {
    const { wedding, website, cover } = await seedWebsite();
    const result = await new ExportAccount(f.deps).execute(anna);
    expect(result.filename).toBe("traureise-export-2026-10-18.zip");

    const entries = FakeArchive.read(result.bytes);
    expect(entries.map((e) => e.path)).toEqual(["data.json", `images/${cover}`]);
    expect(entries[1]!.bytes).toEqual(new Uint8Array([1, 2, 3]));

    const data = JSON.parse(new TextDecoder().decode(entries[0]!.bytes));
    expect(data.account).toMatchObject({ email: "anna@example.org", firstName: "Anna" });
    expect(data.exportedAt).toBe("2026-10-18T10:00:00.000Z");
    expect(data.weddings).toHaveLength(1);
    expect(data.weddings[0]).toMatchObject({ id: wedding.id, title: "Anna & Ben", weddingDate: "2027-06-12", slug: "anna-und-ben" });
    expect(data.weddings[0].events).toEqual([{ id: expect.any(String), data: expect.objectContaining({ name: "Trauung" }) }]);
    expect(data.weddings[0].websites[0]).toMatchObject({ id: website.id, label: "Standard", published: false, coverImage: `images/${cover}` });
    const exportedSite = data.weddings[0].websites[0];
    expect(exportedSite).not.toHaveProperty("hiddenEventIds");
    expect(exportedSite.sections[0]).toEqual({
      id: expect.any(String),
      position: 0,
      title: "Unsere Geschichte",
      visible: true,
      suggestedType: "text",
      blocks: [{ id: expect.any(String), position: 0, data: { type: "text", text: "Kennengelernt im Zug." } }],
    });
    expect(exportedSite.sections.at(-1).blocks).toEqual([expect.objectContaining({ data: expect.objectContaining({ question: "Dresscode?" }) })]);
    expect(data.weddings[0].cards.map((c: { kind: string; label: string }) => c.label)).toEqual(["Standard", "Standard", "Standard", "Standard"]);
    expect(data.files).toEqual([{ path: `images/${cover}`, weddingId: wedding.id, contentType: "image/webp" }]);
  });

  it("includes every version and which version each household gets", async () => {
    const { wedding } = await seedWebsite();
    f.deps.billing.enabled = false;
    const family = await new AddVersion(f.deps).execute(anna, wedding.id, "invitation", { label: "Familie", copyFrom: null });
    const weber = await new SaveHousehold(f.deps).execute(anna, wedding.id, null, { name: "Weber", people: [{ name: "Eva" }] });
    await new AssignVersion(f.deps).execute(anna, wedding.id, weber.id, "invitation", family.id);
    const data = JSON.parse(new TextDecoder().decode(FakeArchive.read((await new ExportAccount(f.deps).execute(anna)).bytes)[0]!.bytes));
    expect(data.weddings[0].cards.filter((c: { kind: string }) => c.kind === "invitation").map((c: { label: string }) => c.label)).toEqual(["Standard", "Familie"]);
    expect(data.weddings[0].guests.versions).toEqual([{ household: "Weber", householdId: weber.id, item: "invitation", versionId: family.id, version: "Familie" }]);
  });

  it("includes purchases", async () => {
    const { wedding } = await seedWebsite();
    await f.billingRepo.applyEvent("evt_1", {
      kind: "grant",
      purchasedBy: null,
      weddingId: wedding.id,
      tier: "rsvp",
      purchaseRef: "ord_1",
      provider: "creem",
      validUntil: new Date("2028-06-13T00:00:00Z"),
    });
    const data = JSON.parse(new TextDecoder().decode(FakeArchive.read((await new ExportAccount(f.deps).execute(anna)).bytes)[0]!.bytes));
    expect(data.weddings[0].purchases).toEqual([expect.objectContaining({ tier: "rsvp", purchaseRef: "ord_1", revokedAt: null })]);
  });

  it("skips images whose file is gone instead of failing", async () => {
    const { cover } = await seedWebsite();
    await f.storage.delete(cover);
    const entries = FakeArchive.read((await new ExportAccount(f.deps).execute(anna)).bytes);
    expect(entries.map((e) => e.path)).toEqual(["data.json"]);
  });

  it("contains only the user's own data", async () => {
    const ben = await f.users.create("ben@example.org");
    await seedWebsite(ben.id);
    const entries = FakeArchive.read((await new ExportAccount(f.deps).execute(anna)).bytes);
    expect(JSON.parse(new TextDecoder().decode(entries[0]!.bytes)).weddings).toEqual([]);
    expect(entries).toHaveLength(1);
  });
});

describe("DeleteAccount", () => {
  it("requires the account's email address as confirmation", async () => {
    await expect(new DeleteAccount(f.deps).execute(anna, "someone@example.org")).rejects.toMatchObject({ fieldErrors: { email: "email_mismatch" } });
    await expect(new DeleteAccount(f.deps).execute(anna, "")).rejects.toBeInstanceOf(ValidationError);
    expect(await f.users.findById(anna)).not.toBeNull();
  });

  it("deletes the user, every row, every stored file, sessions and login traces", async () => {
    await seedWebsite();
    await new RequestMagicLink(f.deps).execute({ email: "anna@example.org", ip: "10.0.0.1" });
    await new VerifyMagicLink(f.deps).execute({ token: "token-2" });
    expect(f.storage.files.size).toBe(1);

    await new DeleteAccount(f.deps).execute(anna, "  Anna@Example.org ");

    expect(await f.users.findById(anna)).toBeNull();
    expect(f.weddings.weddings).toEqual([]);
    expect(f.weddings.events).toEqual([]);
    expect(f.cards.cards).toEqual([]);
    expect(f.websites.websites).toEqual([]);
    expect(f.websites.blocks).toEqual([]);
    expect(f.websites.sections).toEqual([]);
    expect(f.uploads.uploads).toEqual([]);
    expect(f.storage.files.size).toBe(0);
    expect(f.sessions.sessions).toEqual([]);
    expect(f.magicLinks.links).toEqual([]);
    expect(f.rateLimiter.hits.filter((h) => h.key.includes("anna@example.org"))).toEqual([]);
  });

  it("leaves other users alone", async () => {
    const ben = await f.users.create("ben@example.org");
    await seedWebsite(ben.id);
    await new DeleteAccount(f.deps).execute(anna, "anna@example.org");
    expect(await f.users.findById(ben.id)).not.toBeNull();
    expect(f.websites.websites).toHaveLength(1);
    expect(f.storage.files.size).toBe(1);
  });

  it("lets the same email sign up again as a new account", async () => {
    await new DeleteAccount(f.deps).execute(anna, "anna@example.org");
    await new RequestMagicLink(f.deps).execute({ email: "anna@example.org", ip: "10.0.0.1" });
    const login = await new VerifyMagicLink(f.deps).execute({ token: "token-1" });
    expect(login.user.id).not.toBe(anna);
    expect(login.needsProfile).toBe(true);
  });
});
