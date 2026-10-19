import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import {
  CreateWebsite,
  DeleteWebsite,
  EnableSite,
  GetWebsiteForOwner,
  ListWebsites,
  SelectTheme,
  SetCoverImage,
  UpdateDesign,
  UpdateHome,
  UpdateSlug,
  UpdateWeddingDetails,
} from "@/application/websites";
import { UploadImage } from "@/application/uploads";
import { SECTION_KINDS } from "@/domain/sections";
import { JPEG, createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: string;
let ben: string;

beforeEach(async () => {
  f = createFakes();
  anna = (await f.users.create("anna@example.org")).id;
  ben = (await f.users.create("ben@example.org")).id;
});

const create = (ownerId = anna, input: Partial<{ title: string; slug: string; weddingDate: string; themeId: string }> = {}) =>
  new CreateWebsite(f.deps).execute(ownerId, { title: "Anna & Ben", ...input });

describe("CreateWebsite", () => {
  it("creates a website with a slug from the title, default theme and every section", async () => {
    const website = await create();
    expect(website).toMatchObject({ slug: "anna-und-ben", title: "Anna & Ben", themeId: "salbei", timezone: "Europe/Berlin" });
    const sections = await f.websites.listSections(website.id);
    expect(sections.map((s) => s.kind)).toEqual(SECTION_KINDS);
    expect(sections.every((s) => s.visible && s.title === null)).toBe(true);
  });

  it("makes generated slugs unique", async () => {
    await create();
    expect((await create(ben)).slug).toBe("anna-und-ben-2");
    expect((await create(ben)).slug).toBe("anna-und-ben-3");
  });

  it("validates a chosen slug and rejects taken ones", async () => {
    expect((await create(anna, { slug: "unser-tag" })).slug).toBe("unser-tag");
    await expect(create(ben, { slug: "unser-tag" })).rejects.toMatchObject({ fieldErrors: { slug: "taken" } });
    await expect(create(ben, { slug: "dashboard" })).rejects.toMatchObject({ fieldErrors: { slug: "reserved" } });
  });

  it("validates title, date and theme", async () => {
    await expect(create(anna, { title: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(create(anna, { weddingDate: "2027-13-01" })).rejects.toBeInstanceOf(ValidationError);
    await expect(create(anna, { themeId: "nope" })).rejects.toMatchObject({ fieldErrors: { themeId: "unknown_theme" } });
    expect((await create(anna, { themeId: "terrakotta", weddingDate: "2027-06-12" })).weddingDate).toBe("2027-06-12");
  });
});

describe("a wedding without a website", () => {
  const cardsOnly = (ownerId = anna) => new CreateWebsite(f.deps).execute(ownerId, { title: "Anna & Ben", weddingDate: "2027-06-12", siteEnabled: false });

  it("can be created with the website switched off", async () => {
    const website = await cardsOnly();
    expect(website).toMatchObject({ siteEnabled: false, slug: "anna-und-ben", themeId: "salbei" });
    expect((await create(ben)).siteEnabled).toBe(true);
  });

  it("gets its website switched on, keeping the wedding, with names, date, address and theme chosen then", async () => {
    const { id } = await cardsOnly();
    const enabled = await new EnableSite(f.deps).execute(anna, id, { title: "Anna & Ben heiraten", weddingDate: "2027-06-19", slug: "unser-fest", themeId: "terrakotta" });
    expect(enabled).toMatchObject({ id, siteEnabled: true, title: "Anna & Ben heiraten", weddingDate: "2027-06-19", slug: "unser-fest", themeId: "terrakotta" });
    expect(await new ListWebsites(f.deps).execute(anna)).toHaveLength(1);
  });

  it("keeps its generated address when none is chosen, and validates like creating a website", async () => {
    const { id } = await cardsOnly();
    await create(ben, { slug: "vergeben" });
    await expect(new EnableSite(f.deps).execute(anna, id, { title: "Anna & Ben", slug: "vergeben" })).rejects.toMatchObject({ fieldErrors: { slug: "taken" } });
    await expect(new EnableSite(f.deps).execute(anna, id, { title: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(new EnableSite(f.deps).execute(anna, id, { title: "Anna & Ben", themeId: "nope" })).rejects.toMatchObject({ fieldErrors: { themeId: "unknown_theme" } });
    expect(await new EnableSite(f.deps).execute(anna, id, { title: "Anna & Ben" })).toMatchObject({ siteEnabled: true, slug: "anna-und-ben", weddingDate: null, themeId: "salbei" });
  });

  it("has its names, date and place edited without the website editor", async () => {
    const { id } = await cardsOnly();
    const updated = await new UpdateWeddingDetails(f.deps).execute(anna, id, { title: "Anna & Ben", weddingDate: "2027-07-03", location: "Beispielstadt" });
    expect(updated).toMatchObject({ title: "Anna & Ben", weddingDate: "2027-07-03", location: "Beispielstadt", siteEnabled: false });
    await expect(new UpdateWeddingDetails(f.deps).execute(anna, id, { title: "", weddingDate: "", location: "" })).rejects.toBeInstanceOf(ValidationError);
    expect(await new UpdateWeddingDetails(f.deps).execute(anna, id, { title: "A & B", weddingDate: "", location: "" })).toMatchObject({ weddingDate: null, location: null });
  });
});

describe("ownership", () => {
  it("lists only the owner's websites", async () => {
    await create(anna);
    await create(ben, { title: "Ben & Cleo" });
    expect((await new ListWebsites(f.deps).execute(anna)).map((w) => w.title)).toEqual(["Anna & Ben"]);
  });

  it("hides other people's websites from every owner-only use case", async () => {
    const website = await create(anna);
    const id = website.id;
    const attempts = [
      () => new GetWebsiteForOwner(f.deps).execute(ben, id),
      () => new UpdateHome(f.deps).execute(ben, id, { title: "Hijack" }),
      () => new UpdateSlug(f.deps).execute(ben, id, "hijack"),
      () => new SelectTheme(f.deps).execute(ben, id, "terrakotta"),
      () => new UpdateDesign(f.deps).execute(ben, id, { paletteId: "dunkel", fontPairingId: "modern" }),
      () => new SetCoverImage(f.deps).execute(ben, id, null),
      () => new DeleteWebsite(f.deps).execute(ben, id),
      () => new EnableSite(f.deps).execute(ben, id, { title: "Hijack" }),
      () => new UpdateWeddingDetails(f.deps).execute(ben, id, { title: "Hijack" }),
      () => new GetWebsiteForOwner(f.deps).execute(anna, "00000000-0000-0000-0000-000000000000"),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    expect((await f.websites.findById(id))?.title).toBe("Anna & Ben");
  });
});

describe("editing", () => {
  it("updates the home section", async () => {
    const { id } = await create();
    const updated = await new UpdateHome(f.deps).execute(anna, id, {
      title: "Anna & Ben heiraten",
      weddingDate: "",
      location: "Beispielstadt",
      welcomeMessage: "Hallo!",
      hashtag: "#ab27",
      showCountdown: true,
      timezone: "Europe/Vienna",
    });
    expect(updated).toMatchObject({ title: "Anna & Ben heiraten", weddingDate: null, location: "Beispielstadt", hashtag: "ab27", showCountdown: true, timezone: "Europe/Vienna" });
  });

  it("changes the slug when valid and free", async () => {
    const { id } = await create();
    await create(ben, { slug: "vergeben" });
    expect((await new UpdateSlug(f.deps).execute(anna, id, "neu-und-frei")).slug).toBe("neu-und-frei");
    expect((await new UpdateSlug(f.deps).execute(anna, id, "neu-und-frei")).slug).toBe("neu-und-frei");
    await expect(new UpdateSlug(f.deps).execute(anna, id, "vergeben")).rejects.toMatchObject({ fieldErrors: { slug: "taken" } });
    await expect(new UpdateSlug(f.deps).execute(anna, id, "Nicht Gültig")).rejects.toMatchObject({ fieldErrors: { slug: "invalid" } });
  });

  it("switches theme and resets palette and fonts to the new theme's defaults", async () => {
    const { id } = await create();
    await new UpdateDesign(f.deps).execute(anna, id, { paletteId: "dunkel", fontPairingId: "modern" });
    expect(await f.websites.findById(id)).toMatchObject({ paletteId: "dunkel", fontPairingId: "modern" });
    await new SelectTheme(f.deps).execute(anna, id, "terrakotta");
    expect(await f.websites.findById(id)).toMatchObject({ themeId: "terrakotta", paletteId: null, fontPairingId: null });
    await expect(new SelectTheme(f.deps).execute(anna, id, "nope")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects palettes not in the theme and unknown font pairings", async () => {
    const { id } = await create();
    await expect(new UpdateDesign(f.deps).execute(anna, id, { paletteId: "neon", fontPairingId: null })).rejects.toMatchObject({ fieldErrors: { paletteId: "unknown_palette" } });
    await expect(new UpdateDesign(f.deps).execute(anna, id, { paletteId: null, fontPairingId: "comic" })).rejects.toMatchObject({ fieldErrors: { fontPairingId: "unknown_font_pairing" } });
  });

  it("sets, replaces and removes the cover image, deleting old files", async () => {
    const { id } = await create();
    const first = await new UploadImage(f.deps).execute(anna, id, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    await new SetCoverImage(f.deps).execute(anna, id, first);
    const second = await new UploadImage(f.deps).execute(anna, id, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    await new SetCoverImage(f.deps).execute(anna, id, second);
    expect((await f.websites.findById(id))?.coverImageKey).toBe(second);
    expect(f.storage.files.has(first)).toBe(false);
    await new SetCoverImage(f.deps).execute(anna, id, null);
    expect((await f.websites.findById(id))?.coverImageKey).toBeNull();
    expect(f.storage.files.size).toBe(0);
  });

  it("refuses images uploaded to another website", async () => {
    const own = await create();
    const other = await create(ben, { title: "Ben & Cleo" });
    const foreign = await new UploadImage(f.deps).execute(ben, other.id, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    await expect(new SetCoverImage(f.deps).execute(anna, own.id, foreign)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("DeleteWebsite", () => {
  it("removes the website with its sections, items and uploaded files", async () => {
    const { id } = await create();
    const key = await new UploadImage(f.deps).execute(anna, id, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    await new DeleteWebsite(f.deps).execute(anna, id);
    expect(await f.websites.findById(id)).toBeNull();
    expect(f.storage.files.has(key)).toBe(false);
    expect(f.uploads.uploads).toHaveLength(0);
  });
});
