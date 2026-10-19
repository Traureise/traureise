import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import { SaveHousehold } from "@/application/guests";
import { ShareCard } from "@/application/cards";
import { UploadImage } from "@/application/uploads";
import { SetCoverImage, SetPublished } from "@/application/websites";
import {
  CreateWedding,
  DeleteWedding,
  GetRecentWedding,
  GetWeddingHome,
  ListWeddings,
  MarkWeddingUsed,
  UpdateWeddingDetails,
  UpdateWeddingSlug,
} from "@/application/weddings";
import { createFakes, JPEG } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: { id: string };

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  anna = await f.users.create("anna@example.org");
});

const create = (input: object = { title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12" }, userId = anna.id) => new CreateWedding(f.deps).execute(userId, input);
const home = (weddingId: string, userId = anna.id) => new GetWeddingHome(f.deps).execute(userId, weddingId);

describe("creating a wedding", () => {
  it("generates one first version of every card and the website, filled in from the wedding", async () => {
    const wedding = await create();
    expect(wedding).toMatchObject({ title: "Anna & Ben", weddingDate: "2027-06-12", slug: "anna-und-ben", ownerId: anna.id });
    const cards = await f.cards.listByWedding(wedding.id);
    expect(cards.map((c) => c.kind).sort()).toEqual(["engagement", "invitation", "saveTheDate", "thankYou"]);
    expect(cards.every((c) => c.label === "Standard" && c.position === 0 && c.content.names === "Anna & Ben")).toBe(true);
    expect(cards.find((c) => c.kind === "saveTheDate")!.content.heading).toBe("Haltet euch den Tag frei");
    const [website, ...more] = await f.websites.listByWedding(wedding.id);
    expect(more).toEqual([]);
    expect(website).toMatchObject({ label: "Standard", position: 0, slug: "anna-und-ben", published: false, themeId: "salbei" });
  });

  it("is never public just because it was created: the website is a draft", async () => {
    const wedding = await create();
    expect((await f.websites.listByWedding(wedding.id))[0]!.published).toBe(false);
  });

  it("works without a date (not planned yet) and needs the names", async () => {
    expect(await create({ title: "Anna & Ben", hasDate: false })).toMatchObject({ weddingDate: null });
    await expect(create({ title: "", hasDate: false })).rejects.toMatchObject({ fieldErrors: { title: "required" } });
    await expect(create({ title: "Anna & Ben", hasDate: true, weddingDate: "" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("picks a free address in the namespace shared with every website version", async () => {
    const first = await create();
    await f.websites.update((await f.websites.listByWedding(first.id))[0]!.id, { slug: "anna-und-ben-2" });
    expect((await create()).slug).toBe("anna-und-ben-3");
  });
});

describe("several weddings", () => {
  it("lists the account's weddings and remembers the one used last", async () => {
    const a = await create();
    f.clock.advance(1000);
    const b = await create({ title: "Clara & Dana", hasDate: false });
    expect((await new GetRecentWedding(f.deps).execute(anna.id))?.id).toBe(b.id);
    await home(a.id);
    // Rendering the home (also a link prefetch) is no visit; the page reports it.
    expect((await new GetRecentWedding(f.deps).execute(anna.id))?.id).toBe(b.id);
    await new MarkWeddingUsed(f.deps).execute(anna.id, a.id);
    expect((await new GetRecentWedding(f.deps).execute(anna.id))?.id).toBe(a.id);
    await expect(new MarkWeddingUsed(f.deps).execute((await f.users.create("eve@example.org")).id, a.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await new ListWeddings(f.deps).execute(anna.id)).map((w) => w.title)).toEqual(["Anna & Ben", "Clara & Dana"]);
  });

  it("has none for a new account", async () => {
    expect(await new GetRecentWedding(f.deps).execute(anna.id)).toBeNull();
  });

  it("keeps someone else's wedding out of reach", async () => {
    const wedding = await create();
    const eve = await f.users.create("eve@example.org");
    await expect(home(wedding.id, eve.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new DeleteWedding(f.deps).execute(eve.id, wedding.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new UpdateWeddingDetails(f.deps).execute(eve.id, wedding.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the home timeline", () => {
  it("walks through the items in order, lifting out the next one", async () => {
    const wedding = await create();
    const view = await home(wedding.id);
    expect(view.steps.map((s) => [s.item, s.state])).toEqual([
      ["engagement", "now"],
      ["saveTheDate", "later"],
      ["website", "later"],
      ["invitation", "later"],
      ["thankYou", "later"],
    ]);
    expect(view.steps[0]!.versions.map((v) => v.label)).toEqual(["Standard"]);
    expect(view.countdown).toBe(237);
  });

  it("marks the engagement shared, the website published and a card sent to every household as done", async () => {
    const wedding = await create();
    const cards = await f.cards.listByWedding(wedding.id);
    await f.cards.markLinkShared(cards.find((c) => c.kind === "engagement")!.id, f.clock.now());
    const weber = await new SaveHousehold(f.deps).execute(anna.id, wedding.id, null, { name: "Weber", people: [{ name: "Eva" }] });
    await new ShareCard(f.deps).execute(anna.id, wedding.id, "saveTheDate", weber.id, "link");
    const view = await home(wedding.id);
    expect(view.steps.map((s) => s.state)).toEqual(["done", "done", "now", "later", "later"]);
    expect(view.steps[1]!.status).toMatchObject({ kind: "household", counts: { households: 1, sent: 1, opened: 0 } });
    await new SetPublished(f.deps).execute(anna.id, view.steps[2]!.versions[0]!.id, true);
    expect((await home(wedding.id)).steps[2]).toMatchObject({ state: "done", status: { kind: "website", online: 1 } });
    expect((await home(wedding.id)).guests).toEqual({ households: 1, coming: 0, open: 1 });
  });

  it("without a date the Save the Date and invitation say they wait for one", async () => {
    const wedding = await create({ title: "Anna & Ben", hasDate: false });
    const view = await home(wedding.id);
    expect(view.countdown).toBeNull();
    expect(view.steps.filter((s) => s.status.kind === "household" && s.status.needsDate).map((s) => s.item)).toEqual(["saveTheDate", "invitation"]);
  });
});

describe("wedding details", () => {
  it("are names, date, place and time zone; cards follow unless their text was changed", async () => {
    const wedding = await create();
    const updated = await new UpdateWeddingDetails(f.deps).execute(anna.id, wedding.id, { title: "Anna & Ben Kern", hasDate: true, weddingDate: "2027-07-01", location: "Kempten", timezone: "Europe/Vienna" });
    expect(updated).toMatchObject({ title: "Anna & Ben Kern", weddingDate: "2027-07-01", location: "Kempten", timezone: "Europe/Vienna" });
    const std = (await f.cards.listByWedding(wedding.id)).find((c) => c.kind === "saveTheDate")!;
    expect(std.content).toMatchObject({ names: "Anna & Ben Kern", place: "Kempten" });
    await new UpdateWeddingDetails(f.deps).execute(anna.id, wedding.id, { title: "Anna & Ben Kern", hasDate: false });
    expect((await f.weddings.findById(wedding.id))!.weddingDate).toBeNull();
  });

  it("change the wedding's address without touching any website version's", async () => {
    const wedding = await create();
    const other = await create({ title: "Clara & Dana", hasDate: false });
    await new UpdateWeddingSlug(f.deps).execute(anna.id, wedding.id, "anna-ben-2027");
    expect((await f.weddings.findById(wedding.id))!.slug).toBe("anna-ben-2027");
    expect((await f.websites.listByWedding(wedding.id))[0]!.slug).toBe("anna-und-ben");
    // Its own website's slug is fine, another wedding's (or its website's) is not.
    await new UpdateWeddingSlug(f.deps).execute(anna.id, wedding.id, "anna-und-ben");
    await expect(new UpdateWeddingSlug(f.deps).execute(anna.id, wedding.id, other.slug)).rejects.toMatchObject({ fieldErrors: { slug: "taken" } });
    await expect(new UpdateWeddingSlug(f.deps).execute(anna.id, wedding.id, "konto")).rejects.toMatchObject({ fieldErrors: { slug: "reserved" } });
  });
});

describe("deleting a wedding", () => {
  it("deletes everything in it: versions, cards, guests, events and photos", async () => {
    const wedding = await create();
    const keep = await create({ title: "Clara & Dana", hasDate: false });
    const key = await new UploadImage(f.deps).execute(anna.id, wedding.id, { bytes: JPEG, size: 4, contentType: "image/jpeg" });
    await new SetCoverImage(f.deps).execute(anna.id, (await f.websites.listByWedding(wedding.id))[0]!.id, key);
    await new SaveHousehold(f.deps).execute(anna.id, wedding.id, null, { name: "Weber", people: [{ name: "Eva" }] });
    await new DeleteWedding(f.deps).execute(anna.id, wedding.id);
    expect(await f.weddings.findById(wedding.id)).toBeNull();
    expect(await f.websites.listByWedding(wedding.id)).toEqual([]);
    expect(await f.cards.listByWedding(wedding.id)).toEqual([]);
    expect(await f.guests.listHouseholds(wedding.id)).toEqual([]);
    expect(f.storage.files.has(key)).toBe(false);
    expect(await f.weddings.findById(keep.id)).not.toBeNull();
  });
});
