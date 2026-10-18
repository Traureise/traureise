import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import { AddItem, DeleteItem, MoveItem, UpdateItem, UpdateSection } from "@/application/sections";
import { UploadImage } from "@/application/uploads";
import { CreateWebsite } from "@/application/websites";
import { JPEG, createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: string;
let ben: string;
let websiteId: string;

beforeEach(async () => {
  f = createFakes();
  anna = (await f.users.create("anna@example.org")).id;
  ben = (await f.users.create("ben@example.org")).id;
  websiteId = (await new CreateWebsite(f.deps).execute(anna, { title: "Anna & Ben" })).id;
});

const faq = (question: string) => ({ question, answer: "Antwort" });
const titles = async () => (await f.websites.listItems(websiteId)).map((i) => (i.data as { question: string }).question);

describe("UpdateSection", () => {
  it("renames, hides and shows a section", async () => {
    await new UpdateSection(f.deps).execute(anna, websiteId, "schedule", { title: "  Ablauf  ", visible: false });
    let schedule = (await f.websites.listSections(websiteId)).find((s) => s.kind === "schedule");
    expect(schedule).toMatchObject({ title: "Ablauf", visible: false });
    await new UpdateSection(f.deps).execute(anna, websiteId, "schedule", { title: "", visible: true });
    schedule = (await f.websites.listSections(websiteId)).find((s) => s.kind === "schedule");
    expect(schedule).toMatchObject({ title: null, visible: true });
  });

  it("stores the story text only for our story", async () => {
    await new UpdateSection(f.deps).execute(anna, websiteId, "our-story", { body: "Es war einmal …" });
    expect((await f.websites.listSections(websiteId))[0]!.body).toBe("Es war einmal …");
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, "faqs", { body: "x" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects overly long titles, unknown sections and foreign websites", async () => {
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, "faqs", { title: "x".repeat(61) })).rejects.toBeInstanceOf(ValidationError);
    await expect(new UpdateSection(f.deps).execute(anna, websiteId, "rsvp" as never, { visible: false })).rejects.toBeInstanceOf(NotFoundError);
    await expect(new UpdateSection(f.deps).execute(ben, websiteId, "faqs", { visible: false })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("items", () => {
  it("adds items to the end, edits and deletes them", async () => {
    const first = await new AddItem(f.deps).execute(anna, websiteId, "faqs", faq("Parken?"));
    await new AddItem(f.deps).execute(anna, websiteId, "faqs", faq("Dresscode?"));
    expect(await titles()).toEqual(["Parken?", "Dresscode?"]);

    await new UpdateItem(f.deps).execute(anna, websiteId, first.id, faq("Wo parken?"));
    expect(await titles()).toEqual(["Wo parken?", "Dresscode?"]);

    await new DeleteItem(f.deps).execute(anna, websiteId, first.id);
    expect(await titles()).toEqual(["Dresscode?"]);
  });

  it("validates item data with the section's schema", async () => {
    await expect(new AddItem(f.deps).execute(anna, websiteId, "faqs", { question: "" })).rejects.toBeInstanceOf(ValidationError);
    await expect(new AddItem(f.deps).execute(anna, websiteId, "our-story" as never, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("moves items up and down", async () => {
    const a = await new AddItem(f.deps).execute(anna, websiteId, "faqs", faq("A"));
    await new AddItem(f.deps).execute(anna, websiteId, "faqs", faq("B"));
    const c = await new AddItem(f.deps).execute(anna, websiteId, "faqs", faq("C"));
    await new MoveItem(f.deps).execute(anna, websiteId, c.id, "up");
    expect(await titles()).toEqual(["A", "C", "B"]);
    await new MoveItem(f.deps).execute(anna, websiteId, a.id, "down");
    expect(await titles()).toEqual(["C", "A", "B"]);
    await new MoveItem(f.deps).execute(anna, websiteId, a.id, "up");
    await new MoveItem(f.deps).execute(anna, websiteId, a.id, "up");
    expect(await titles()).toEqual(["A", "C", "B"]);
  });

  it("keeps sections independent when ordering", async () => {
    await new AddItem(f.deps).execute(anna, websiteId, "registry", { name: "Kasse", url: "https://example.org" });
    const faqItem = await new AddItem(f.deps).execute(anna, websiteId, "faqs", faq("A"));
    expect(faqItem.position).toBe(0);
  });

  it("protects items of other websites", async () => {
    const item = await new AddItem(f.deps).execute(anna, websiteId, "faqs", faq("A"));
    const other = await new CreateWebsite(f.deps).execute(ben, { title: "Ben & Cleo" });
    await expect(new UpdateItem(f.deps).execute(ben, other.id, item.id, faq("X"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(new DeleteItem(f.deps).execute(ben, websiteId, item.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new MoveItem(f.deps).execute(ben, websiteId, item.id, "up")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("checks image ownership and cleans up replaced and deleted images", async () => {
    const upload = () => new UploadImage(f.deps).execute(anna, websiteId, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    const k1 = await upload();
    const item = await new AddItem(f.deps).execute(anna, websiteId, "gallery", { imageKey: k1, caption: "Antrag" });
    const k2 = await upload();
    await new UpdateItem(f.deps).execute(anna, websiteId, item.id, { imageKey: k2, caption: "Antrag" });
    expect(f.storage.files.has(k1)).toBe(false);
    await new DeleteItem(f.deps).execute(anna, websiteId, item.id);
    expect(f.storage.files.has(k2)).toBe(false);
    await expect(new AddItem(f.deps).execute(anna, websiteId, "gallery", { imageKey: "someone-else.webp" })).rejects.toBeInstanceOf(ValidationError);
  });
});
