import { beforeEach, describe, expect, it } from "vitest";
import { GetHouseholdPage, ShareCard, SendCardEmails, RunMailJobs } from "@/application/cards";
import { LockedError, NotFoundError, ValidationError } from "@/application/errors";
import { GetGuestPage, SaveHousehold } from "@/application/guests";
import { GetPublicWebsite } from "@/application/public";
import { AddBlock, DeleteSection } from "@/application/sections";
import { UploadImage } from "@/application/uploads";
import { AddVersion, AssignVersion, DeleteVersion, RenameVersion } from "@/application/versions";
import { CreateWedding } from "@/application/weddings";
import { SetPublished } from "@/application/websites";
import type { PaidTier } from "@/domain/billing";
import { parseEvent } from "@/domain/sections";
import { JPEG, createFakes } from "../../fakes";

const STANDARD_TITLES = ["Unsere Geschichte", "Tagesablauf", "Anreise", "Empfehlungen", "Geschenkideen", "Hochzeitsgesellschaft", "Galerie", "Häufige Fragen"];

function trauung() {
  const parsed = parseEvent({ eventType: "ceremony", name: "Trauung", startDate: "2027-06-12", startTime: "14:30" });
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
}

let f: ReturnType<typeof createFakes>;
let anna: { id: string };
let weddingId: string;

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  anna = await f.users.create("anna@example.org");
  weddingId = (await new CreateWedding(f.deps).execute(anna.id, { title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12" })).id;
});

const add = (item: Parameters<AddVersion["execute"]>[2], label: string, copyFrom: string | null = null, userId = anna.id) =>
  new AddVersion(f.deps).execute(userId, weddingId, item, { label, copyFrom });
const cardsOf = async (kind: string) => (await f.cards.listByWedding(weddingId)).filter((c) => c.kind === kind);
const household = (name: string, email: string | null = null) => new SaveHousehold(f.deps).execute(anna.id, weddingId, null, { name, people: [{ name: `${name} 1`, email }] });
const grant = async (tier: PaidTier) => {
  f.deps.billing.enabled = true;
  await f.billingRepo.applyEvent(`evt-${Math.random()}`, { kind: "grant", weddingId, tier, purchaseRef: `ord-${Math.random()}`, provider: "testpay", validUntil: new Date("2028-06-13T00:00:00Z") });
};

describe("adding versions", () => {
  it("copies the chosen version under a new name and places it after the others", async () => {
    const [first] = await cardsOf("saveTheDate");
    await f.cards.update(first!.id, { ...first!, content: { ...first!.content, text: "Merkt euch den Tag" } });
    const family = await add("saveTheDate", "Familie", first!.id);
    expect(family).toMatchObject({ label: "Familie", position: 1 });
    const card = (await cardsOf("saveTheDate")).find((c) => c.id === family.id)!;
    expect(card.content.text).toBe("Merkt euch den Tag");
    expect(card.slug).toBe("familie");
    expect((await add("saveTheDate", "Familie")).id).not.toBe(family.id);
    expect((await cardsOf("saveTheDate")).map((c) => c.slug)).toEqual(["standard", "familie", "familie-2"]);
  });

  it("adds a website version with its own address, as a draft, with sections and blocks copied", async () => {
    const [first] = await f.websites.listByWedding(weddingId);
    const sections = await f.websites.listSections(first!.id);
    const faqs = sections.find((x) => x.title === "Häufige Fragen")!;
    await f.websites.updateSection(faqs.id, { title: "Fragen" });
    await f.websites.addBlock(first!.id, faqs.id, { type: "faq", question: "Parken?", answer: "Am Hof.", imageKey: null });
    const event = await f.weddings.addEvent(weddingId, trauung());
    await f.websites.addBlock(first!.id, faqs.id, { type: "event", eventId: event.id });
    const friends = await add("website", "Freunde", first!.id);
    const site = (await f.websites.findById(friends.id))!;
    expect(site).toMatchObject({ label: "Freunde", position: 1, slug: "anna-und-ben-freunde", published: false });
    const copied = await f.websites.listSections(site.id);
    expect(copied.map((x) => x.title)).toEqual(sections.map((x) => (x.id === faqs.id ? "Fragen" : x.title)));
    expect(copied.map((x) => x.id)).not.toContain(faqs.id);
    const blocks = await f.websites.listBlocks(site.id);
    expect(blocks.map((b) => b.data)).toEqual([
      { type: "event", eventId: null },
      { type: "faq", question: "Parken?", answer: "Am Hof.", imageKey: null },
      { type: "event", eventId: event.id },
    ]);
    expect(blocks[1]!.sectionId).toBe(copied.find((x) => x.title === "Fragen")!.id);
  });

  it("adds a website version from the standard template, keeping the source's design", async () => {
    const [first] = await f.websites.listByWedding(weddingId);
    await f.websites.update(first!.id, { themeId: "bogen", welcomeMessage: "Hallo" });
    const [story] = await f.websites.listSections(first!.id);
    await f.websites.updateSection(story!.id, { title: "Wie alles begann" });
    await f.websites.addBlock(first!.id, story!.id, { type: "text", text: "Es war einmal" });
    const friends = await new AddVersion(f.deps).execute(anna.id, weddingId, "website", { label: "Freunde", copyFrom: first!.id, fromTemplate: true });
    const site = (await f.websites.findById(friends.id))!;
    expect(site).toMatchObject({ themeId: "bogen", welcomeMessage: "Hallo", published: false });
    expect((await f.websites.listSections(site.id)).map((x) => x.title)).toEqual(STANDARD_TITLES);
    expect((await f.websites.listBlocks(site.id)).map((b) => b.data)).toEqual([{ type: "event", eventId: null }]);
  });

  it("deletes a section of a copied version without deleting the photo the original still shows", async () => {
    const [first] = await f.websites.listByWedding(weddingId);
    const gallery = (await f.websites.listSections(first!.id)).find((x) => x.title === "Galerie")!;
    const key = await new UploadImage(f.deps).execute(anna.id, weddingId, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    await new AddBlock(f.deps).execute(anna.id, first!.id, gallery.id, { type: "image", imageKey: key, caption: "" });
    const friends = await add("website", "Freunde", first!.id);
    const copiedGallery = (await f.websites.listSections(friends.id)).find((x) => x.title === "Galerie")!;
    await new DeleteSection(f.deps).execute(anna.id, friends.id, copiedGallery.id);
    expect(f.storage.files.has(key)).toBe(true);
    await new DeleteSection(f.deps).execute(anna.id, first!.id, gallery.id);
    expect(f.storage.files.has(key)).toBe(false);
  });

  it("are paid: RSVP for websites and Save the Dates, Einladungen for invitations, Komplett for the others", async () => {
    f.deps.billing.enabled = true;
    for (const item of ["engagement", "saveTheDate", "website", "invitation", "thankYou"] as const) await expect(add(item, "Familie")).rejects.toBeInstanceOf(LockedError);
    await grant("rsvp");
    await add("website", "Freunde");
    await add("saveTheDate", "Familie");
    await expect(add("invitation", "Familie")).rejects.toBeInstanceOf(LockedError);
    await grant("invitations");
    await add("invitation", "Familie");
    await expect(add("thankYou", "Familie")).rejects.toBeInstanceOf(LockedError);
    await grant("complete");
    await add("thankYou", "Familie");
    await add("engagement", "Familie");
  });

  it("needs a name and only copies a version of the same item and wedding", async () => {
    await expect(add("saveTheDate", " ")).rejects.toMatchObject({ fieldErrors: { label: "required" } });
    const [invitation] = await cardsOf("invitation");
    await expect(add("saveTheDate", "Familie", invitation!.id)).rejects.toBeInstanceOf(NotFoundError);
    const other = await new CreateWedding(f.deps).execute(anna.id, { title: "Clara & Dana", hasDate: false });
    const [foreign] = (await f.cards.listByWedding(other.id)).filter((c) => c.kind === "saveTheDate");
    await expect(add("saveTheDate", "Familie", foreign!.id)).rejects.toBeInstanceOf(NotFoundError);
    const eve = await f.users.create("eve@example.org");
    await expect(add("saveTheDate", "Familie", null, eve.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("renaming and deleting versions", () => {
  it("renames a version; its link stays", async () => {
    const family = await add("engagement", "Familie");
    await new RenameVersion(f.deps).execute(anna.id, weddingId, "engagement", family.id, "Verwandte");
    expect((await cardsOf("engagement")).find((c) => c.id === family.id)).toMatchObject({ label: "Verwandte", slug: "familie" });
  });

  it("never deletes the last version of an item", async () => {
    const [only] = await cardsOf("thankYou");
    await expect(new DeleteVersion(f.deps).execute(anna.id, weddingId, "thankYou", only!.id)).rejects.toMatchObject({ fieldErrors: { _: "last_version" } });
    const [site] = await f.websites.listByWedding(weddingId);
    await expect(new DeleteVersion(f.deps).execute(anna.id, weddingId, "website", site!.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("moves the households of a deleted version to the first remaining one and keeps their status", async () => {
    const family = await add("saveTheDate", "Familie");
    const weber = await household("Weber");
    await new AssignVersion(f.deps).execute(anna.id, weddingId, weber.id, "saveTheDate", family.id);
    await new ShareCard(f.deps).execute(anna.id, weddingId, "saveTheDate", weber.id, "link");
    await new DeleteVersion(f.deps).execute(anna.id, weddingId, "saveTheDate", family.id);
    const entry = (await new GetGuestPage(f.deps).execute(anna.id, weddingId)).households[0]!;
    expect(entry.versions.saveTheDate).toBe((await cardsOf("saveTheDate"))[0]!.id);
    expect(entry.deliveries.saveTheDate?.sharedAt).not.toBeNull();
  });
});

describe("who gets what", () => {
  it("each household gets its assigned version, by default the first", async () => {
    const family = await add("saveTheDate", "Familie");
    await f.cards.update(family.id, { ...(await f.cards.findById(family.id))!, content: { ...(await f.cards.findById(family.id))!.content, text: "Für die Familie" } });
    const weber = await household("Weber");
    const kern = await household("Kern");
    await new AssignVersion(f.deps).execute(anna.id, weddingId, weber.id, "saveTheDate", family.id);
    for (const h of [weber, kern]) await new ShareCard(f.deps).execute(anna.id, weddingId, "saveTheDate", h.id, "link");
    const text = async (id: string) => {
      const view = await new GetHouseholdPage(f.deps).execute(f.guestLinks.tokenFor(id));
      return view?.state === "page" ? view.cards.map((c) => c.model.text) : [];
    };
    expect(await text(weber.id)).toEqual(["Für die Familie"]);
    expect(await text(kern.id)).toEqual(["Einladung folgt"]);
  });

  it("re-assigning after sending sends nothing again; the page shows the new version", async () => {
    const family = await add("invitation", "Familie");
    const weber = await household("Weber", "weber@example.org");
    await new SendCardEmails(f.deps).execute(anna.id, weddingId, "invitation", "all");
    await new RunMailJobs(f.deps).execute({ weddingId });
    expect(f.mailer.sent).toHaveLength(1);
    await new AssignVersion(f.deps).execute(anna.id, weddingId, weber.id, "invitation", family.id);
    expect((await new SendCardEmails(f.deps).execute(anna.id, weddingId, "invitation", "all")).queued).toBe(0);
    const view = await new GetHouseholdPage(f.deps).execute(f.guestLinks.tokenFor(weber.id));
    expect(view?.state === "page" && view.cards[0]!.label).toBe("Familie");
  });

  it("the household's cards link to its assigned website version, once that is online", async () => {
    const [first] = await f.websites.listByWedding(weddingId);
    const friends = await add("website", "Freunde");
    const weber = await household("Weber");
    await new AssignVersion(f.deps).execute(anna.id, weddingId, weber.id, "website", friends.id);
    await new ShareCard(f.deps).execute(anna.id, weddingId, "saveTheDate", weber.id, "link");
    const card = async () => {
      const view = await new GetHouseholdPage(f.deps).execute(f.guestLinks.tokenFor(weber.id));
      return view?.state === "page" ? view.cards[0]! : null;
    };
    // A draft: no link, but the page takes its design already.
    expect((await card())?.websiteUrl).toBeNull();
    await new SetPublished(f.deps).execute(anna.id, first!.id, true);
    expect((await card())?.websiteUrl).toBeNull();
    await new SetPublished(f.deps).execute(anna.id, friends.id, true);
    expect((await card())?.websiteUrl).toBe("/anna-und-ben-freunde");
  });

  it("an extra website version goes offline without a paid package; versions already added stay", async () => {
    await grant("complete");
    const friends = await add("website", "Freunde");
    const family = await add("thankYou", "Familie");
    await new SetPublished(f.deps).execute(anna.id, friends.id, true);
    const site = () => new GetPublicWebsite(f.deps).execute("anna-und-ben-freunde");
    expect((await site())?.website.label).toBe("Freunde");
    f.billingRepo.entitlements.forEach((e) => (e.revokedAt = new Date()));
    expect(await site()).toBeNull();
    expect((await f.cards.findById(family.id))?.label).toBe("Familie");
    // Billing off (self-hosted): everything is unlimited.
    f.deps.billing.enabled = false;
    expect(await site()).not.toBeNull();
  });

  it("only assigns a version of the same item and wedding to a household of that wedding", async () => {
    const weber = await household("Weber");
    const [invitation] = await cardsOf("invitation");
    const [engagement] = await cardsOf("engagement");
    await expect(new AssignVersion(f.deps).execute(anna.id, weddingId, weber.id, "saveTheDate", invitation!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new AssignVersion(f.deps).execute(anna.id, weddingId, weber.id, "invitation", engagement!.id)).rejects.toBeInstanceOf(NotFoundError);
    // The engagement announcement is chosen per household like every other card.
    await new AssignVersion(f.deps).execute(anna.id, weddingId, weber.id, "engagement", engagement!.id);
    const other = await new CreateWedding(f.deps).execute(anna.id, { title: "Clara & Dana", hasDate: false });
    const [foreign] = await f.websites.listByWedding(other.id);
    await expect(new AssignVersion(f.deps).execute(anna.id, weddingId, weber.id, "website", foreign!.id)).rejects.toBeInstanceOf(NotFoundError);
    const eve = await f.users.create("eve@example.org");
    const [std] = await cardsOf("saveTheDate");
    await expect(new AssignVersion(f.deps).execute(eve.id, weddingId, weber.id, "saveTheDate", std!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("the guest list offers a choice only for items with more than one version", async () => {
    await household("Weber");
    await add("invitation", "Familie");
    const page = await new GetGuestPage(f.deps).execute(anna.id, weddingId);
    expect(page.versionChoices.map((c) => [c.item, c.versions.map((v) => v.label)])).toEqual([["invitation", ["Standard", "Familie"]]]);
  });

  it("events belong to the wedding; a copied version points to the same events", async () => {
    const event = await f.weddings.addEvent(weddingId, trauung());
    await add("website", "Freunde");
    expect((await f.weddings.listEvents(weddingId)).map((e) => e.id)).toEqual([event.id]);
  });
});
