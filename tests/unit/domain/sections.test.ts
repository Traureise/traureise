import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPES,
  EVENT_TYPES,
  PARTY_ROLES,
  PLACE_TYPES,
  SECTION_TEMPLATES,
  TEMPLATE_SUGGESTIONS,
  compareEvents,
  groupBlocks,
  parseBlock,
  parseEvent,
  templateBlocks,
  type BlockType,
  type EventData,
} from "@/domain/sections";

describe("vocabularies", () => {
  it("offers seven block types, the place types and the event and role vocabularies", () => {
    expect(BLOCK_TYPES).toEqual(["text", "event", "person", "place", "link", "faq", "image"]);
    expect(PLACE_TYPES).toEqual(["hotel", "parking", "arrival", "activity", "other"]);
    expect(EVENT_TYPES).toEqual([
      "welcome",
      "rehearsal",
      "cocktail",
      "wedding",
      "ceremony",
      "reception",
      "after-party",
      "brunch",
      "other",
    ]);
    expect(PARTY_ROLES.length).toBeGreaterThanOrEqual(35);
    expect(new Set(PARTY_ROLES).size).toBe(PARTY_ROLES.length);
  });
});

describe("standard template", () => {
  it("lists today's eight sections in order, each with a suggested block type", () => {
    expect(SECTION_TEMPLATES).toEqual([
      "our-story",
      "schedule",
      "travel",
      "things-to-do",
      "registry",
      "wedding-party",
      "gallery",
      "faqs",
    ]);
    expect(TEMPLATE_SUGGESTIONS).toEqual({
      "our-story": "text",
      schedule: "event",
      travel: "place",
      "things-to-do": "place",
      registry: "link",
      "wedding-party": "person",
      gallery: "image",
      faqs: "faq",
    });
  });

  it("starts only the schedule with a block showing all events", () => {
    expect(templateBlocks("schedule")).toEqual([{ type: "event", eventId: null }]);
    expect(templateBlocks("faqs")).toEqual([]);
  });
});

describe("parseBlock", () => {
  it("accepts one example of each type and fills the defaults", () => {
    const examples: Record<BlockType, unknown> = {
      text: { type: "text", text: "Wir freuen uns." },
      event: { type: "event", eventId: "6f1c1a3e-2b1d-4c4e-9a0b-1f2e3d4c5b6a" },
      person: { type: "person", name: "Lena", role: "best-woman" },
      place: { type: "place", name: "Hotel Linde", placeType: "hotel", address: "", description: "" },
      link: { type: "link", name: "Hochzeitskasse", url: "https://example.org/kasse", description: "" },
      faq: { type: "faq", question: "Dresscode?", answer: "Sommerlich." },
      image: { type: "image", imageKey: "abc.webp", caption: "" },
    };
    for (const input of Object.values(examples)) expect(parseBlock(input).ok).toBe(true);
    const person = parseBlock(examples.person);
    expect(person.ok && person.value).toMatchObject({ text: "", imageKey: null });
    const place = parseBlock(examples.place);
    expect(place.ok && place.value).toMatchObject({ website: null });
  });

  it("rejects unknown and missing types", () => {
    expect(parseBlock({ type: "unknown" }).ok).toBe(false);
    expect(parseBlock({}).ok).toBe(false);
  });

  it("requires text in a text block", () => {
    const result = parseBlock({ type: "text", text: "" });
    expect(!result.ok && result.fieldErrors.text).toBe("required");
  });

  it("takes null for all events and otherwise an event id", () => {
    expect(parseBlock({ type: "event", eventId: null }).ok).toBe(true);
    expect(parseBlock({ type: "event", eventId: "nope" }).ok).toBe(false);
  });

  it("limits the person text", () => {
    const result = parseBlock({ type: "person", name: "Lena", role: "best-woman", text: "x".repeat(2001) });
    expect(!result.ok && result.fieldErrors.text).toBe("too_long");
  });

  it("validates fields like the old items did", () => {
    expect(parseBlock({ type: "link", name: "Kasse", url: "javascript:alert(1)", description: "" }).ok).toBe(false);
    expect(parseBlock({ type: "place", name: "Altstadt", placeType: "activity", website: "example.org" }).ok).toBe(true);
    expect(parseBlock({ type: "place", name: "Altstadt", placeType: "castle" }).ok).toBe(false);
    expect(parseBlock({ type: "person", name: "Mia", role: "queen" }).ok).toBe(false);
    expect(parseBlock({ type: "image", caption: "Ohne Bild" }).ok).toBe(false);
    expect(parseBlock({ type: "faq", question: "", answer: "x" }).ok).toBe(false);
    const faq = parseBlock({ type: "faq", question: "  Parken?  ", answer: " Ja " });
    expect(faq.ok && faq.value).toMatchObject({ question: "Parken?", answer: "Ja", imageKey: null });
  });
});

describe("parseEvent", () => {
  const event = {
    eventType: "ceremony",
    name: "Freie Trauung",
    startDate: "2027-06-12",
    startTime: "14:30",
    venueName: "Gut Sonnenhof",
    address: "Hofweg 3, 12345 Beispielstadt",
    description: "",
    website: "",
  };

  it("accepts an event and normalises optional fields", () => {
    const result = parseEvent(event);
    expect(result.ok && result.value).toMatchObject({ name: "Freie Trauung", endDate: null, endTime: null, imageKey: null });
  });

  it("defaults the end date to the start date when only an end time is given", () => {
    const result = parseEvent({ ...event, endTime: "16:00" });
    expect(result.ok && result.value).toMatchObject({ endDate: "2027-06-12", endTime: "16:00" });
  });

  it("reports an end before the start together with other field errors", () => {
    const result = parseEvent({ ...event, endDate: "2027-06-12", endTime: "13:00", website: "kein link", name: "" });
    expect(!result.ok && result.fieldErrors).toMatchObject({ endTime: "end_before_start", website: "invalid_url", name: "required" });
  });

  it("asks for an empty start date and time instead of calling them invalid", () => {
    const result = parseEvent({ ...event, startDate: "", startTime: "" });
    expect(!result.ok && result.fieldErrors).toMatchObject({ startDate: "required", startTime: "required" });
    expect(!parseEvent({ ...event, startDate: "2027-13-40" }).ok && parseEvent({ ...event, startDate: "2027-13-40" })).toMatchObject({
      fieldErrors: { startDate: "invalid_date" },
    });
  });

  it("requires an end time when an end date is given", () => {
    expect(!parseEvent({ ...event, endDate: "2027-06-13" }).ok && parseEvent({ ...event, endDate: "2027-06-13" })).toMatchObject({
      fieldErrors: { endTime: "required" },
    });
  });

  it("keeps the coordinates of a place picked on the map, both or none", () => {
    const picked = parseEvent({ ...event, latitude: "47.7216", longitude: "10.3132" });
    expect(picked.ok && picked.value).toMatchObject({ latitude: 47.7216, longitude: 10.3132 });
    expect(parseEvent(event).ok && parseEvent(event)).toMatchObject({ value: { latitude: null, longitude: null } });
    expect(parseEvent({ ...event, latitude: "95", longitude: "10" }).ok).toBe(false);
    expect(parseEvent({ ...event, latitude: "47.7", longitude: "" }).ok).toBe(false);
  });

  it("accepts an end after midnight and rejects malformed times and unknown types", () => {
    expect(parseEvent({ ...event, endDate: "2027-06-13", endTime: "02:00" }).ok).toBe(true);
    expect(parseEvent({ ...event, startTime: "25:00" }).ok).toBe(false);
    expect(parseEvent({ ...event, eventType: "party" }).ok).toBe(false);
  });
});

describe("compareEvents", () => {
  const at = (startDate: string, startTime: string) => ({ data: { startDate, startTime } as EventData });

  it("orders by date, then start time", () => {
    const sorted = [at("2027-06-12", "18:00"), at("2027-06-11", "20:00"), at("2027-06-12", "14:00")].sort(compareEvents);
    expect(sorted.map((e) => `${e.data.startDate} ${e.data.startTime}`)).toEqual([
      "2027-06-11 20:00",
      "2027-06-12 14:00",
      "2027-06-12 18:00",
    ]);
  });
});

describe("groupBlocks", () => {
  it("groups consecutive blocks of the same type", () => {
    const blocks = (["text", "person", "person", "place", "person"] as const).map((type) => ({ data: { type } }));
    expect(groupBlocks(blocks).map((g) => g.length)).toEqual([1, 2, 1, 1]);
  });
});
