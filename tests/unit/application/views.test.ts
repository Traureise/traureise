import { beforeEach, describe, expect, it } from "vitest";
import { AddEvent } from "@/application/schedule";
import { AddBlock, AddSection, UpdateSection } from "@/application/sections";
import { renderableSections, shownEventIds, type RenderGroup } from "@/application/views";
import { GetWebsiteForOwner } from "@/application/websites";
import { createFakes } from "../../fakes";
import { newWedding } from "../../fakes/wedding";

let f: ReturnType<typeof createFakes>;
let anna: string;
let weddingId: string;
let websiteId: string;

const event = (name: string, startDate: string) => ({ eventType: "ceremony", name, startDate, startTime: "14:00" });
const view = () => new GetWebsiteForOwner(f.deps).execute(anna, websiteId);
const eventNames = (group: RenderGroup | undefined) => (group?.type === "event" ? group.events.map((e) => e.data.name) : null);

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  anna = (await f.users.create("anna@example.org")).id;
  ({ weddingId, websiteId } = await newWedding(f.deps, anna));
});

describe("renderableSections", () => {
  it("hides a section whose only block shows all events while there are none", async () => {
    const v = await view();
    expect(renderableSections(v)).toEqual([]);
    expect(shownEventIds(v).size).toBe(0);
  });

  it("shows all events chronologically in one group", async () => {
    const b = await new AddEvent(f.deps).execute(anna, weddingId, event("B", "2027-06-12"));
    const a = await new AddEvent(f.deps).execute(anna, weddingId, event("A", "2027-06-11"));
    const v = await view();
    const [schedule] = renderableSections(v);
    expect(schedule!.groups).toHaveLength(1);
    expect(eventNames(schedule!.groups[0])).toEqual(["A", "B"]);
    expect(shownEventIds(v)).toEqual(new Set([a.id, b.id]));
  });

  it("lists a single event first and skips it when all events follow", async () => {
    const b = await new AddEvent(f.deps).execute(anna, weddingId, event("B", "2027-06-12"));
    await new AddEvent(f.deps).execute(anna, weddingId, event("A", "2027-06-11"));
    const section = await new AddSection(f.deps).execute(anna, websiteId, { template: null });
    await new AddBlock(f.deps).execute(anna, websiteId, section.id, { type: "event", eventId: b.id });
    await new AddBlock(f.deps).execute(anna, websiteId, section.id, { type: "event", eventId: null });
    const rendered = renderableSections(await view()).find((s) => s.id === section.id)!;
    expect(rendered.groups.map(eventNames)).toEqual([["B", "A"]]);
  });

  it("groups consecutive blocks of the same type and keeps the section order", async () => {
    const [, , , , , party] = await f.websites.listSections(websiteId);
    await new AddBlock(f.deps).execute(anna, websiteId, party!.id, { type: "text", text: "Ohne sie" });
    await new AddBlock(f.deps).execute(anna, websiteId, party!.id, { type: "person", name: "Lena", role: "best-woman" });
    await new AddBlock(f.deps).execute(anna, websiteId, party!.id, { type: "person", name: "Jonas", role: "best-man" });
    const [rendered] = renderableSections(await view());
    expect(rendered).toMatchObject({ id: party!.id, title: "Hochzeitsgesellschaft" });
    expect(rendered!.groups.map((g) => [g.type, g.type === "event" ? g.events.length : g.blocks.length])).toEqual([
      ["text", 1],
      ["person", 2],
    ]);
  });

  it("never renders a hidden section", async () => {
    const [story] = await f.websites.listSections(websiteId);
    await new AddBlock(f.deps).execute(anna, websiteId, story!.id, { type: "text", text: "Kennengelernt im Zug." });
    await new UpdateSection(f.deps).execute(anna, websiteId, story!.id, { visible: false });
    expect(renderableSections(await view())).toEqual([]);
  });

  it("keeps two sections with the same title apart by id", async () => {
    for (let i = 0; i < 2; i++) {
      const section = await new AddSection(f.deps).execute(anna, websiteId, { template: null });
      await new UpdateSection(f.deps).execute(anna, websiteId, section.id, { title: "Infos" });
      await new AddBlock(f.deps).execute(anna, websiteId, section.id, { type: "text", text: `Text ${i}` });
    }
    const rendered = renderableSections(await view());
    expect(rendered.map((s) => s.title)).toEqual(["Infos", "Infos"]);
    expect(new Set(rendered.map((s) => s.id)).size).toBe(2);
  });
});
