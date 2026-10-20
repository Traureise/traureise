import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import { AddEvent, DeleteEvent, ListEvents, UpdateEvent } from "@/application/schedule";
import { AddBlock } from "@/application/sections";
import { UploadImage } from "@/application/uploads";
import { AddVersion } from "@/application/versions";
import { GetWebsiteForOwner } from "@/application/websites";
import { renderableSections } from "@/application/views";
import { JPEG, createFakes } from "../../fakes";
import { newWedding } from "../../fakes/wedding";

let f: ReturnType<typeof createFakes>;
let anna: string;
let ben: string;
let weddingId: string;
let websiteId: string;

const event = (name: string, startDate = "2027-06-12", startTime = "14:00") => ({ eventType: "ceremony", name, startDate, startTime });

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  anna = (await f.users.create("anna@example.org")).id;
  ben = (await f.users.create("ben@example.org")).id;
  ({ weddingId, websiteId } = await newWedding(f.deps, anna));
});

describe("the Ablauf", () => {
  it("lists the wedding's events chronologically", async () => {
    await new AddEvent(f.deps).execute(anna, weddingId, event("Feier", "2027-06-12", "18:00"));
    await new AddEvent(f.deps).execute(anna, weddingId, event("Vorabend", "2027-06-11", "20:00"));
    const { wedding, events } = await new ListEvents(f.deps).execute(anna, weddingId);
    expect(wedding.id).toBe(weddingId);
    expect(events.map((e) => e.data.name)).toEqual(["Vorabend", "Feier"]);
  });

  it("the first event fills the invitations that have none; the second changes nothing", async () => {
    const invitation = () => f.cards.listByWedding(weddingId).then((cards) => cards.find((c) => c.kind === "invitation")!);
    const first = await new AddEvent(f.deps).execute(anna, weddingId, event("Trauung"));
    expect((await invitation()).content.eventId).toBe(first.id);
    await new AddEvent(f.deps).execute(anna, weddingId, event("Feier", "2027-06-12", "10:00"));
    expect((await invitation()).content.eventId).toBe(first.id);
  });

  it("validates events like the schedule form did", async () => {
    await expect(new AddEvent(f.deps).execute(anna, weddingId, { ...event("Trauung"), endDate: "2027-06-12", endTime: "13:00" })).rejects.toMatchObject({
      fieldErrors: { endTime: "end_before_start" },
    });
    await expect(new AddEvent(f.deps).execute(anna, weddingId, { ...event(""), imageKey: "someone-else.webp" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates an event and releases a replaced photo", async () => {
    const upload = () => new UploadImage(f.deps).execute(anna, weddingId, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    const k1 = await upload();
    const trauung = await new AddEvent(f.deps).execute(anna, weddingId, { ...event("Trauung"), imageKey: k1 });
    await new UpdateEvent(f.deps).execute(anna, weddingId, trauung.id, event("Standesamt"));
    expect((await f.weddings.findEvent(weddingId, trauung.id))!.data.name).toBe("Standesamt");
    expect(f.storage.files.has(k1)).toBe(false);
  });

  it("deleting an event removes the blocks pointing to it in every version, and its photo", async () => {
    const key = await new UploadImage(f.deps).execute(anna, weddingId, { bytes: JPEG, size: JPEG.length, contentType: "image/jpeg" });
    const brunch = await new AddEvent(f.deps).execute(anna, weddingId, { ...event("Brunch", "2027-06-13", "11:00"), imageKey: key });
    const friends = await new AddVersion(f.deps).execute(anna, weddingId, "website", { label: "Freunde", copyFrom: null });
    const [section] = await f.websites.listSections(friends.id);
    await new AddBlock(f.deps).execute(anna, friends.id, section!.id, { type: "event", eventId: brunch.id });
    await new DeleteEvent(f.deps).execute(anna, weddingId, brunch.id);
    expect((await f.websites.listBlocks(friends.id)).filter((b) => b.data.type === "event" && b.data.eventId === brunch.id)).toEqual([]);
    expect(f.storage.files.has(key)).toBe(false);
    const view = await new GetWebsiteForOwner(f.deps).execute(anna, friends.id);
    expect(() => renderableSections(view)).not.toThrow();
    expect(renderableSections(view)).toEqual([]);
    expect(await f.websites.listBlocks(websiteId)).toEqual([expect.objectContaining({ data: { type: "event", eventId: null } })]);
  });

  it("keeps someone else's wedding and events out of reach", async () => {
    const trauung = await new AddEvent(f.deps).execute(anna, weddingId, event("Trauung"));
    await expect(new ListEvents(f.deps).execute(ben, weddingId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new AddEvent(f.deps).execute(ben, weddingId, event("Feier"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(new UpdateEvent(f.deps).execute(ben, weddingId, trauung.id, event("X"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(new DeleteEvent(f.deps).execute(ben, weddingId, trauung.id)).rejects.toBeInstanceOf(NotFoundError);
    const other = await newWedding(f.deps, ben, { title: "Ben & Cleo" });
    await expect(new DeleteEvent(f.deps).execute(ben, other.weddingId, trauung.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new UpdateEvent(f.deps).execute(anna, weddingId, "nope", event("X"))).rejects.toBeInstanceOf(NotFoundError);
  });
});
