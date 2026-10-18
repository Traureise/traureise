import { beforeEach, describe, expect, it } from "vitest";
import { DeleteAccount, ExportAccount } from "@/application/account";
import { RequestMagicLink, VerifyMagicLink } from "@/application/auth";
import { ValidationError } from "@/application/errors";
import { AddItem, UpdateSection } from "@/application/sections";
import { UploadImage } from "@/application/uploads";
import { CreateWebsite, SetCoverImage } from "@/application/websites";
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
  const website = await new CreateWebsite(f.deps).execute(ownerId, { title: "Anna & Ben", weddingDate: "2027-06-12" });
  const cover = await new UploadImage(f.deps).execute(ownerId, website.id, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
  await new SetCoverImage(f.deps).execute(ownerId, website.id, cover);
  await new UpdateSection(f.deps).execute(ownerId, website.id, "our-story", { body: "Kennengelernt im Zug." });
  await new AddItem(f.deps).execute(ownerId, website.id, "faqs", { question: "Dresscode?", answer: "Sommerlich" });
  return { website, cover };
}

describe("ExportAccount", () => {
  it("exports account, websites, sections, items and every uploaded image", async () => {
    const { website, cover } = await seedWebsite();
    const result = await new ExportAccount(f.deps).execute(anna);
    expect(result.filename).toBe("traureise-export-2026-10-18.zip");

    const entries = FakeArchive.read(result.bytes);
    expect(entries.map((e) => e.path)).toEqual(["data.json", `images/${cover}`]);
    expect(entries[1]!.bytes).toEqual(new Uint8Array([1, 2, 3]));

    const data = JSON.parse(new TextDecoder().decode(entries[0]!.bytes));
    expect(data.account).toMatchObject({ email: "anna@example.org", firstName: "Anna" });
    expect(data.exportedAt).toBe("2026-10-18T10:00:00.000Z");
    expect(data.websites).toHaveLength(1);
    expect(data.websites[0]).toMatchObject({ id: website.id, title: "Anna & Ben", weddingDate: "2027-06-12", coverImage: `images/${cover}` });
    expect(data.websites[0].sections.find((s: { kind: string }) => s.kind === "our-story").body).toBe("Kennengelernt im Zug.");
    expect(data.websites[0].items).toEqual([expect.objectContaining({ kind: "faqs", data: expect.objectContaining({ question: "Dresscode?" }) })]);
    expect(data.files).toEqual([{ path: `images/${cover}`, websiteId: website.id, contentType: "image/webp" }]);
  });

  it("includes purchases", async () => {
    const { website } = await seedWebsite();
    await f.billingRepo.applyEvent("evt_1", {
      kind: "grant",
      websiteId: website.id,
      tier: "rsvp",
      purchaseRef: "ord_1",
      provider: "creem",
      validUntil: new Date("2028-06-13T00:00:00Z"),
    });
    const data = JSON.parse(new TextDecoder().decode(FakeArchive.read((await new ExportAccount(f.deps).execute(anna)).bytes)[0]!.bytes));
    expect(data.websites[0].purchases).toEqual([expect.objectContaining({ tier: "rsvp", purchaseRef: "ord_1", revokedAt: null })]);
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
    expect(JSON.parse(new TextDecoder().decode(entries[0]!.bytes)).websites).toEqual([]);
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
    expect(f.websites.websites).toEqual([]);
    expect(f.websites.items).toEqual([]);
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
