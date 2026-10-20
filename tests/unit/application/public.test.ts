import { beforeEach, describe, expect, it } from "vitest";
import { GetEventIcs, GetPublicWebsite, GetWeddingIcs } from "@/application/public";
import { AddEvent } from "@/application/schedule";
import { AddBlock, UpdateSection } from "@/application/sections";
import { AddVersion } from "@/application/versions";
import { SetPublished, UpdateSlug } from "@/application/websites";
import { createFakes } from "../../fakes";
import { newWedding } from "../../fakes/wedding";

let f: ReturnType<typeof createFakes>;
let anna: string;
let websiteId: string;
let weddingId: string;

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
  f.deps.billing.enabled = false;
  ({ websiteId, weddingId } = await newWedding(f.deps, anna, { published: true }));
});

describe("GetPublicWebsite", () => {
  it("returns the website by slug with design resolved, or null", async () => {
    const view = await new GetPublicWebsite(f.deps).execute("anna-und-ben");
    expect(view?.website.title).toBe("Anna & Ben");
    expect(view?.design.palette.id).toBe("hell");
    expect(await new GetPublicWebsite(f.deps).execute("unknown")).toBeNull();
  });

  it("is null for a draft, and so are its calendar events", async () => {
    const item = await new AddEvent(f.deps).execute(anna, weddingId, event);
    await new SetPublished(f.deps).execute(anna, websiteId, false);
    expect(await new GetPublicWebsite(f.deps).execute("anna-und-ben")).toBeNull();
    expect(await new GetEventIcs(f.deps).execute("anna-und-ben", item.id)).toBeNull();
  });

  it("shows a version by its own slug; a wedding-only slug shows the first online version", async () => {
    const friends = await new AddVersion(f.deps).execute(anna, weddingId, "website", { label: "Freunde", copyFrom: null });
    expect(await new GetPublicWebsite(f.deps).execute("anna-und-ben-freunde")).toBeNull();
    await new SetPublished(f.deps).execute(anna, friends.id, true);
    expect((await new GetPublicWebsite(f.deps).execute("anna-und-ben-freunde"))?.website.label).toBe("Freunde");
    // The first version moves to its own address: the wedding's slug still finds an online version.
    await new UpdateSlug(f.deps).execute(anna, websiteId, "anna-ben-familie");
    expect((await new GetPublicWebsite(f.deps).execute("anna-und-ben"))?.website.label).toBe("Standard");
    await new SetPublished(f.deps).execute(anna, websiteId, false);
    expect((await new GetPublicWebsite(f.deps).execute("anna-und-ben"))?.website.label).toBe("Freunde");
    // A version's own slug never falls back to another version.
    expect(await new GetPublicWebsite(f.deps).execute("anna-ben-familie")).toBeNull();
  });
});

describe("GetEventIcs", () => {
  const sectionTitled = async (title: string) => (await f.websites.listSections(websiteId)).find((s) => s.title === title)!;

  it("exports an event the site shows through a visible all-events block, and nothing else", async () => {
    const item = await new AddEvent(f.deps).execute(anna, weddingId, event);
    const ics = await new GetEventIcs(f.deps).execute("anna-und-ben", item.id);
    expect(ics?.filename).toBe("trauung.ics");
    expect(ics?.content).toContain("DTSTART:20270612T120000Z");
    expect(ics?.content).toContain("URL:http://localhost:3000/anna-und-ben");
    expect(await new GetEventIcs(f.deps).execute("anna-und-ben", "nope")).toBeNull();
  });

  it("is null for an event only a hidden section shows", async () => {
    const item = await new AddEvent(f.deps).execute(anna, weddingId, event);
    const schedule = await sectionTitled("Tagesablauf");
    await new UpdateSection(f.deps).execute(anna, websiteId, schedule.id, { visible: false });
    const faqs = await sectionTitled("Häufige Fragen");
    await new UpdateSection(f.deps).execute(anna, websiteId, faqs.id, { visible: false });
    await new AddBlock(f.deps).execute(anna, websiteId, faqs.id, { type: "event", eventId: item.id });
    expect(await new GetEventIcs(f.deps).execute("anna-und-ben", item.id)).toBeNull();
    await new UpdateSection(f.deps).execute(anna, websiteId, faqs.id, { visible: true });
    expect(await new GetEventIcs(f.deps).execute("anna-und-ben", item.id)).not.toBeNull();
  });
});

describe("GetWeddingIcs", () => {
  it("is the wedding day as an all-day event, or null without a date", async () => {
    expect(await new GetWeddingIcs(f.deps).execute("anna-und-ben")).toBeNull();
    const { wedding } = await newWedding(f.deps, anna, { title: "Clara & Dan", weddingDate: "2027-06-12", published: true });
    const ics = await new GetWeddingIcs(f.deps).execute(wedding.slug);
    expect(ics?.filename).toBe(`${wedding.slug}.ics`);
    expect(ics?.content).toContain("SUMMARY:Hochzeit von Clara & Dan");
    expect(ics?.content).toContain("DTSTART;VALUE=DATE:20270612");
    expect(ics?.content).toContain(`URL:http://localhost:3000/${wedding.slug}`);
  });

  it("works while the website is a draft, without linking to it, and through a version's slug", async () => {
    const { wedding, websiteId: site } = await newWedding(f.deps, anna, { title: "Clara & Dan", weddingDate: "2027-06-12" });
    const ics = await new GetWeddingIcs(f.deps).execute(wedding.slug);
    expect(ics?.content).toContain("DTSTART;VALUE=DATE:20270612");
    expect(ics?.content).not.toContain(`/${wedding.slug}`);
    await new UpdateSlug(f.deps).execute(anna, site, "clara-dan-fest");
    expect((await new GetWeddingIcs(f.deps).execute("clara-dan-fest"))?.filename).toBe(`${wedding.slug}.ics`);
  });
});
