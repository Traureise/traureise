import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import { AddBlock, AddSection, DeleteBlock, DeleteSection, MoveBlock, MoveSection, UpdateBlock, UpdateSection } from "@/application/sections";
import { UploadImage } from "@/application/uploads";
import { parseEvent } from "@/domain/sections";
import { JPEG, createFakes } from "../../fakes";
import { newWedding } from "../../fakes/wedding";

let f: ReturnType<typeof createFakes>;
let anna: string;
let ben: string;
let websiteId: string;
let weddingId: string;

beforeEach(async () => {
  f = createFakes();
  anna = (await f.users.create("anna@example.org")).id;
  ben = (await f.users.create("ben@example.org")).id;
  ({ websiteId, weddingId } = await newWedding(f.deps, anna));
});

const sections = () => f.websites.listSections(websiteId);
const sectionTitled = async (title: string) => (await sections()).find((s) => s.title === title)!;
const blockTypes = async (sectionId: string) => (await f.websites.listBlocks(websiteId)).filter((b) => b.sectionId === sectionId).map((b) => b.data.type);
function event(name: string) {
  const parsed = parseEvent({ eventType: "ceremony", name, startDate: "2027-06-12", startTime: "14:00" });
  if (!parsed.ok) throw new Error("fixture");
  return parsed.value;
}

describe("AddSection", () => {
  it("adds an empty section at the end", async () => {
    const section = await new AddSection(f.deps).execute(anna, websiteId, { template: null });
    expect(section).toMatchObject({ title: "Neuer Abschnitt", visible: true, suggestedType: null, position: 8 });
    expect((await sections()).at(-1)!.id).toBe(section.id);
    expect(await blockTypes(section.id)).toEqual([]);
  });

  it("adds a section of the standard template with its default setup", async () => {
    const section = await new AddSection(f.deps).execute(anna, websiteId, { template: "wedding-party" });
    expect(section).toMatchObject({ title: "Hochzeitsgesellschaft", suggestedType: "person" });
    const schedule = await new AddSection(f.deps).execute(anna, websiteId, { template: "schedule" });
    expect((await f.websites.listBlocks(websiteId)).filter((b) => b.sectionId === schedule.id).map((b) => b.data)).toEqual([{ type: "event", eventId: null }]);
  });

  it("rejects unknown templates and foreign websites", async () => {
    await expect(new AddSection(f.deps).execute(anna, websiteId, { template: "bogus" as never })).rejects.toMatchObject({ fieldErrors: { template: "invalid_option" } });
    await expect(new AddSection(f.deps).execute(ben, websiteId, { template: null })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("UpdateSection", () => {
  it("renames, hides and shows a section", async () => {
    const faqs = await sectionTitled("Häufige Fragen");
    await new UpdateSection(f.deps).execute(anna, websiteId, faqs.id, { title: "  Fragen  ", visible: false });
    expect(await f.websites.findSection(websiteId, faqs.id)).toMatchObject({ title: "Fragen", visible: false });
    await new UpdateSection(f.deps).execute(anna, websiteId, faqs.id, { visible: true });
    expect(await f.websites.findSection(websiteId, faqs.id)).toMatchObject({ title: "Fragen", visible: true });
  });

  it("needs a title of at most 60 characters", async () => {
    const faqs = await sectionTitled("Häufige Fragen");
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, faqs.id, { title: "  " })).rejects.toMatchObject({ fieldErrors: { title: "required" } });
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, faqs.id, { title: "x".repeat(61) })).rejects.toMatchObject({ fieldErrors: { title: "too_long" } });
  });

  it("answers a title that is not text with a field error", async () => {
    const faqs = await sectionTitled("Häufige Fragen");
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, faqs.id, { title: 5 as never })).rejects.toMatchObject({ fieldErrors: { title: "required" } });
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, faqs.id, { visible: "ja" as never })).rejects.toBeInstanceOf(ValidationError);
  });

  it("keeps sections of other websites out of reach", async () => {
    const other = await newWedding(f.deps, ben, { title: "Ben & Cleo" });
    const [bens] = await f.websites.listSections(other.websiteId);
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, bens!.id, { visible: false })).rejects.toBeInstanceOf(NotFoundError);
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, "nope", { visible: false })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("MoveSection", () => {
  it("moves a section one step; the first one cannot move up", async () => {
    const [first, , third] = await sections();
    await new MoveSection(f.deps).execute(anna, websiteId, third!.id, "up");
    expect((await sections())[1]!.id).toBe(third!.id);
    await new MoveSection(f.deps).execute(anna, websiteId, first!.id, "up");
    expect((await sections())[0]!.id).toBe(first!.id);
    await expect(new MoveSection(f.deps).execute(ben, websiteId, first!.id, "down")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("blocks", () => {
  it("adds blocks at the end of a section and moves them within it", async () => {
    const party = await sectionTitled("Hochzeitsgesellschaft");
    await new AddBlock(f.deps).execute(anna, websiteId, party.id, { type: "text", text: "Ohne sie wären wir nicht hier." });
    const person = await new AddBlock(f.deps).execute(anna, websiteId, party.id, { type: "person", name: "Lena", role: "best-woman" });
    expect(await blockTypes(party.id)).toEqual(["text", "person"]);
    await new MoveBlock(f.deps).execute(anna, websiteId, person.id, "up");
    expect(await blockTypes(party.id)).toEqual(["person", "text"]);
  });

  it("edits a block but never changes its type", async () => {
    const faqs = await sectionTitled("Häufige Fragen");
    const block = await new AddBlock(f.deps).execute(anna, websiteId, faqs.id, { type: "faq", question: "Parken?", answer: "Am Hof." });
    await new UpdateBlock(f.deps).execute(anna, websiteId, block.id, { type: "faq", question: "Wo parken?", answer: "Am Hof." });
    expect((await f.websites.findBlock(websiteId, block.id))!.data).toMatchObject({ question: "Wo parken?" });
    await expect(new UpdateBlock(f.deps).execute(anna, websiteId, block.id, { type: "text", text: "x" })).rejects.toMatchObject({ fieldErrors: { type: "invalid_option" } });
    await new DeleteBlock(f.deps).execute(anna, websiteId, block.id);
    expect(await f.websites.findBlock(websiteId, block.id)).toBeNull();
  });

  it("validates block data", async () => {
    const faqs = await sectionTitled("Häufige Fragen");
    await expect(new AddBlock(f.deps).execute(anna, websiteId, faqs.id, { type: "faq", question: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(new AddBlock(f.deps).execute(anna, websiteId, faqs.id, { type: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("only references events of the same wedding", async () => {
    const schedule = await sectionTitled("Tagesablauf");
    const own = await f.weddings.addEvent(weddingId, event("Trauung"));
    await new AddBlock(f.deps).execute(anna, websiteId, schedule.id, { type: "event", eventId: own.id });
    const other = await newWedding(f.deps, ben, { title: "Ben & Cleo" });
    const foreign = await f.weddings.addEvent(other.weddingId, own.data);
    await expect(new AddBlock(f.deps).execute(anna, websiteId, schedule.id, { type: "event", eventId: foreign.id })).rejects.toMatchObject({
      fieldErrors: { eventId: "invalid_option" },
    });
  });

  it("protects blocks and sections of other websites", async () => {
    const faqs = await sectionTitled("Häufige Fragen");
    const block = await new AddBlock(f.deps).execute(anna, websiteId, faqs.id, { type: "faq", question: "A", answer: "1" });
    const other = await newWedding(f.deps, ben, { title: "Ben & Cleo" });
    const [bens] = await f.websites.listSections(other.websiteId);
    await expect(new AddBlock(f.deps).execute(anna, websiteId, bens!.id, { type: "text", text: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(new UpdateBlock(f.deps).execute(ben, other.websiteId, block.id, { type: "faq", question: "X", answer: "1" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(new DeleteBlock(f.deps).execute(ben, websiteId, block.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new MoveBlock(f.deps).execute(ben, websiteId, block.id, "up")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("checks image ownership and cleans up replaced and deleted images", async () => {
    const gallery = await sectionTitled("Galerie");
    const upload = () => new UploadImage(f.deps).execute(anna, weddingId, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    const k1 = await upload();
    const block = await new AddBlock(f.deps).execute(anna, websiteId, gallery.id, { type: "image", imageKey: k1, caption: "Antrag" });
    const k2 = await upload();
    await new UpdateBlock(f.deps).execute(anna, websiteId, block.id, { type: "image", imageKey: k2, caption: "Antrag" });
    expect(f.storage.files.has(k1)).toBe(false);
    await new DeleteBlock(f.deps).execute(anna, websiteId, block.id);
    expect(f.storage.files.has(k2)).toBe(false);
    await expect(new AddBlock(f.deps).execute(anna, websiteId, gallery.id, { type: "image", imageKey: "someone-else.webp" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("DeleteSection", () => {
  it("deletes the section with its blocks and releases their photos", async () => {
    const gallery = await sectionTitled("Galerie");
    const key = await new UploadImage(f.deps).execute(anna, weddingId, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    await new AddBlock(f.deps).execute(anna, websiteId, gallery.id, { type: "image", imageKey: key, caption: "" });
    await new DeleteSection(f.deps).execute(anna, websiteId, gallery.id);
    expect(await f.websites.findSection(websiteId, gallery.id)).toBeNull();
    expect(await f.websites.listBlocks(websiteId)).toHaveLength(1); // the schedule's "Alle Termine"
    expect(f.storage.files.has(key)).toBe(false);
    await expect(new DeleteSection(f.deps).execute(anna, websiteId, gallery.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
