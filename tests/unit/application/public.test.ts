import { beforeEach, describe, expect, it } from "vitest";
import { GetEventIcs, GetPublicWebsite, GetWeddingIcs } from "@/application/public";
import { AddItem, UpdateSection } from "@/application/sections";
import { CreateWebsite, GetWebsiteForOwner } from "@/application/websites";
import { renderableSections } from "@/application/views";
import { createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: string;
let websiteId: string;

const event = {
  eventType: "ceremony",
  name: "Trauung",
  startDate: "2027-06-12",
  startTime: "14:00",
  venueName: "Gut Sonnenhof",
  address: "Hofweg 3",
};

beforeEach(async () => {
  f = createFakes();
  anna = (await f.users.create("anna@example.org")).id;
  websiteId = (await new CreateWebsite(f.deps).execute(anna, { title: "Anna & Ben" })).id;
});

describe("GetPublicWebsite", () => {
  it("returns the website by slug with design resolved, or null", async () => {
    const view = await new GetPublicWebsite(f.deps).execute("anna-und-ben");
    expect(view?.website.title).toBe("Anna & Ben");
    expect(view?.design.palette.id).toBe("hell");
    expect(await new GetPublicWebsite(f.deps).execute("unknown")).toBeNull();
  });
});

describe("renderableSections", () => {
  it("contains visible sections with content in fixed order, and nothing hidden", async () => {
    await new AddItem(f.deps).execute(anna, websiteId, "faqs", { question: "Parken?", answer: "Ja" });
    await new AddItem(f.deps).execute(anna, websiteId, "schedule", event);
    await new UpdateSection(f.deps).execute(anna, websiteId, "our-story", { body: "Kennengelernt im Zug." });
    await new AddItem(f.deps).execute(anna, websiteId, "registry", { name: "Kasse", url: "https://example.org" });
    await new UpdateSection(f.deps).execute(anna, websiteId, "registry", { visible: false });

    const view = await new GetWebsiteForOwner(f.deps).execute(anna, websiteId);
    const sections = renderableSections(view);
    expect(sections.map((s) => s.kind)).toEqual(["our-story", "schedule", "faqs"]);
    expect(sections[2]!.items).toHaveLength(1);
  });
});

describe("GetEventIcs", () => {
  it("exports a visible schedule event and nothing else", async () => {
    const item = await new AddItem(f.deps).execute(anna, websiteId, "schedule", event);
    const ics = await new GetEventIcs(f.deps).execute("anna-und-ben", item.id);
    expect(ics?.filename).toBe("trauung.ics");
    expect(ics?.content).toContain("DTSTART:20270612T120000Z");
    expect(ics?.content).toContain("URL:http://localhost:3000/anna-und-ben");

    const faq = await new AddItem(f.deps).execute(anna, websiteId, "faqs", { question: "Q", answer: "A" });
    expect(await new GetEventIcs(f.deps).execute("anna-und-ben", faq.id)).toBeNull();

    await new UpdateSection(f.deps).execute(anna, websiteId, "schedule", { visible: false });
    expect(await new GetEventIcs(f.deps).execute("anna-und-ben", item.id)).toBeNull();
  });
});

describe("GetWeddingIcs", () => {
  it("is the wedding day as an all-day event, or null without a date", async () => {
    expect(await new GetWeddingIcs(f.deps).execute("anna-und-ben")).toBeNull();
    const other = await new CreateWebsite(f.deps).execute(anna, { title: "Clara & Dan", weddingDate: "2027-06-12" });
    const ics = await new GetWeddingIcs(f.deps).execute(other.slug);
    expect(ics?.filename).toBe(`${other.slug}.ics`);
    expect(ics?.content).toContain("SUMMARY:Hochzeit von Clara & Dan");
    expect(ics?.content).toContain("DTSTART;VALUE=DATE:20270612");
  });
});
