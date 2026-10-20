import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import { AddVersion } from "@/application/versions";
import { CreateWedding } from "@/application/weddings";
import {
  GetWebsiteForOwner,
  SelectTheme,
  SetCoverImage,
  SetPublished,
  UpdateDesign,
  UpdateHome,
  UpdateSlug,
} from "@/application/websites";
import { UploadImage } from "@/application/uploads";
import { JPEG, createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: string;
let ben: string;
let weddingId: string;
let id: string;

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  anna = (await f.users.create("anna@example.org")).id;
  ben = (await f.users.create("ben@example.org")).id;
  weddingId = (await new CreateWedding(f.deps).execute(anna, { title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12" })).id;
  id = (await f.websites.listByWedding(weddingId))[0]!.id;
});

const upload = (userId = anna, wedding = weddingId) => new UploadImage(f.deps).execute(userId, wedding, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });

describe("the first website version", () => {
  it("has every section, the default theme and the wedding's names and date", async () => {
    const view = await new GetWebsiteForOwner(f.deps).execute(anna, id);
    expect(view.sections).toHaveLength(8);
    expect(view.sections.every((s) => s.visible)).toBe(true);
    expect(view.website).toMatchObject({ title: "Anna & Ben", weddingDate: "2027-06-12", timezone: "Europe/Berlin", themeId: "salbei", published: false });
    expect(view).toMatchObject({ online: false, publicUrl: "http://localhost:3000/anna-und-ben", versions: [{ id, label: "Standard" }] });
  });

  it("is published and taken offline by the couple", async () => {
    await new SetPublished(f.deps).execute(anna, id, true);
    expect((await new GetWebsiteForOwner(f.deps).execute(anna, id)).online).toBe(true);
    await new SetPublished(f.deps).execute(anna, id, false);
    expect((await f.websites.findById(id))!.published).toBe(false);
  });
});

describe("ownership", () => {
  it("hides other people's website versions from every owner-only use case", async () => {
    const attempts = [
      () => new GetWebsiteForOwner(f.deps).execute(ben, id),
      () => new UpdateHome(f.deps).execute(ben, id, { welcomeMessage: "Hijack" }),
      () => new UpdateSlug(f.deps).execute(ben, id, "hijack"),
      () => new SelectTheme(f.deps).execute(ben, id, "terrakotta"),
      () => new UpdateDesign(f.deps).execute(ben, id, { paletteId: "dunkel", fontPairingId: "modern" }),
      () => new SetCoverImage(f.deps).execute(ben, id, null),
      () => new SetPublished(f.deps).execute(ben, id, true),
      () => new GetWebsiteForOwner(f.deps).execute(anna, "00000000-0000-0000-0000-000000000000"),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(NotFoundError);
    expect((await f.websites.findById(id))?.published).toBe(false);
  });
});

describe("editing", () => {
  it("updates the version's own home section: welcome text, hashtag, countdown", async () => {
    const updated = await new UpdateHome(f.deps).execute(anna, id, { welcomeMessage: "Hallo!", hashtag: "#ab27", showCountdown: true });
    expect(updated).toMatchObject({ welcomeMessage: "Hallo!", hashtag: "ab27", showCountdown: true });
    await expect(new UpdateHome(f.deps).execute(anna, id, { hashtag: "a b" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("changes the address when valid and free in the namespace shared with weddings", async () => {
    const other = await new CreateWedding(f.deps).execute(ben, { title: "Vergeben", hasDate: false });
    expect((await new UpdateSlug(f.deps).execute(anna, id, "neu-und-frei")).slug).toBe("neu-und-frei");
    expect((await new UpdateSlug(f.deps).execute(anna, id, "neu-und-frei")).slug).toBe("neu-und-frei");
    // The own wedding's slug is fine; another wedding's is not, nor another wedding's website.
    expect((await new UpdateSlug(f.deps).execute(anna, id, "anna-und-ben")).slug).toBe("anna-und-ben");
    await expect(new UpdateSlug(f.deps).execute(anna, id, other.slug)).rejects.toMatchObject({ fieldErrors: { slug: "taken" } });
    await expect(new UpdateSlug(f.deps).execute(anna, id, "Nicht Gültig")).rejects.toMatchObject({ fieldErrors: { slug: "invalid" } });
    await expect(new UpdateSlug(f.deps).execute(anna, id, "hochzeiten")).rejects.toMatchObject({ fieldErrors: { slug: "reserved" } });
  });

  it("never lets two versions share an address", async () => {
    const friends = await new AddVersion(f.deps).execute(anna, weddingId, "website", { label: "Freunde", copyFrom: null });
    await expect(new UpdateSlug(f.deps).execute(anna, friends.id, "anna-und-ben")).rejects.toMatchObject({ fieldErrors: { slug: "taken" } });
  });

  it("switches theme and resets palette and fonts to the new theme's defaults", async () => {
    await new UpdateDesign(f.deps).execute(anna, id, { paletteId: "dunkel", fontPairingId: "modern" });
    expect(await f.websites.findById(id)).toMatchObject({ paletteId: "dunkel", fontPairingId: "modern" });
    await new SelectTheme(f.deps).execute(anna, id, "terrakotta");
    expect(await f.websites.findById(id)).toMatchObject({ themeId: "terrakotta", paletteId: null, fontPairingId: null });
    await expect(new SelectTheme(f.deps).execute(anna, id, "nope")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects palettes not in the theme and unknown font pairings", async () => {
    await expect(new UpdateDesign(f.deps).execute(anna, id, { paletteId: "neon", fontPairingId: null })).rejects.toMatchObject({ fieldErrors: { paletteId: "unknown_palette" } });
    await expect(new UpdateDesign(f.deps).execute(anna, id, { paletteId: null, fontPairingId: "comic" })).rejects.toMatchObject({ fieldErrors: { fontPairingId: "unknown_font_pairing" } });
  });

  it("sets, replaces and removes the cover image, deleting files nothing uses any more", async () => {
    const first = await upload();
    await new SetCoverImage(f.deps).execute(anna, id, first);
    const second = await upload();
    await new SetCoverImage(f.deps).execute(anna, id, second);
    expect((await f.websites.findById(id))?.coverImageKey).toBe(second);
    expect(f.storage.files.has(first)).toBe(false);
    await new SetCoverImage(f.deps).execute(anna, id, null);
    expect((await f.websites.findById(id))?.coverImageKey).toBeNull();
    expect(f.storage.files.size).toBe(0);
  });

  it("keeps a replaced cover that a copied version or a card still shows", async () => {
    const cover = await upload();
    await new SetCoverImage(f.deps).execute(anna, id, cover);
    const friends = await new AddVersion(f.deps).execute(anna, weddingId, "website", { label: "Freunde", copyFrom: id });
    await new SetCoverImage(f.deps).execute(anna, id, null);
    expect(f.storage.files.has(cover)).toBe(true);
    const std = (await f.cards.listByWedding(weddingId)).find((c) => c.kind === "saveTheDate")!;
    await f.cards.update(std.id, { ...std, photoKey: cover });
    await new SetCoverImage(f.deps).execute(anna, friends.id, null);
    expect(f.storage.files.has(cover)).toBe(true);
  });

  it("refuses images uploaded to another wedding", async () => {
    const other = await new CreateWedding(f.deps).execute(ben, { title: "Ben & Cleo", hasDate: false });
    const foreign = await upload(ben, other.id);
    await expect(new SetCoverImage(f.deps).execute(anna, id, foreign)).rejects.toBeInstanceOf(ValidationError);
  });
});

