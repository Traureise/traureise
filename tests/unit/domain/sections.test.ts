import { describe, expect, it } from "vitest";
import {
  COLLECTION_KINDS,
  EVENT_TYPES,
  PARTY_ROLES,
  SECTION_KINDS,
  TRAVEL_TYPES,
  isCollectionKind,
  parseItem,
} from "@/domain/sections";

describe("section catalogue", () => {
  it("lists sections in the fixed default order", () => {
    expect(SECTION_KINDS).toEqual([
      "our-story",
      "schedule",
      "travel",
      "things-to-do",
      "registry",
      "wedding-party",
      "gallery",
      "faqs",
    ]);
  });

  it("treats every section except our story as a collection", () => {
    expect(COLLECTION_KINDS).not.toContain("our-story");
    expect(COLLECTION_KINDS).toHaveLength(7);
    expect(isCollectionKind("our-story")).toBe(false);
    expect(isCollectionKind("faqs")).toBe(true);
    expect(isCollectionKind("nope")).toBe(false);
  });

  it("offers the event, travel and role vocabularies", () => {
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
    expect(TRAVEL_TYPES).toEqual(["hotel", "arrival", "parking", "other"]);
    expect(PARTY_ROLES.length).toBeGreaterThanOrEqual(35);
    expect(new Set(PARTY_ROLES).size).toBe(PARTY_ROLES.length);
  });
});

describe("parseItem", () => {
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

  it("accepts a schedule event and normalises optional fields", () => {
    const result = parseItem("schedule", event);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ name: "Freie Trauung", endDate: null, endTime: null, imageKey: null });
    }
  });

  it("defaults the end date to the start date when only an end time is given", () => {
    const result = parseItem("schedule", { ...event, endTime: "16:00" });
    expect(result.ok && result.value).toMatchObject({ endDate: "2027-06-12", endTime: "16:00" });
  });

  it("rejects an end before the start", () => {
    const result = parseItem("schedule", { ...event, endDate: "2027-06-12", endTime: "13:00" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toHaveProperty("endTime");
  });

  it("reports a bad end time together with other field errors", () => {
    const result = parseItem("schedule", { ...event, endDate: "2027-06-12", endTime: "13:00", website: "kein link", name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toMatchObject({ endTime: "end_before_start", website: "invalid_url", name: "required" });
  });

  it("requires an end time when an end date is given", () => {
    const result = parseItem("schedule", { ...event, endDate: "2027-06-13" });
    expect(!result.ok && result.fieldErrors).toMatchObject({ endTime: "required" });
  });

  it("accepts an end after midnight", () => {
    expect(parseItem("schedule", { ...event, endDate: "2027-06-13", endTime: "02:00" }).ok).toBe(true);
  });

  it("rejects malformed times and unknown types", () => {
    expect(parseItem("schedule", { ...event, startTime: "25:00" }).ok).toBe(false);
    expect(parseItem("schedule", { ...event, eventType: "party" }).ok).toBe(false);
  });

  it("requires http(s) URLs for websites", () => {
    expect(parseItem("registry", { name: "Hochzeitskasse", url: "javascript:alert(1)", description: "" }).ok).toBe(false);
    expect(parseItem("registry", { name: "Hochzeitskasse", url: "https://example.org/kasse", description: "" }).ok).toBe(true);
    expect(parseItem("things-to-do", { name: "Altstadt", website: "example.org", description: "" }).ok).toBe(true);
  });

  it("validates the remaining collections", () => {
    expect(parseItem("travel", { name: "Hotel Linde", type: "hotel", address: "", website: "", description: "" }).ok).toBe(true);
    expect(parseItem("wedding-party", { name: "Mia", role: "best-woman" }).ok).toBe(true);
    expect(parseItem("wedding-party", { name: "Mia", role: "queen" }).ok).toBe(false);
    expect(parseItem("gallery", { caption: "Ohne Bild" }).ok).toBe(false);
    expect(parseItem("gallery", { imageKey: "abc.webp", caption: "" }).ok).toBe(true);
    expect(parseItem("faqs", { question: "Dresscode?", answer: "Sommerlich." }).ok).toBe(true);
    expect(parseItem("faqs", { question: "", answer: "x" }).ok).toBe(false);
  });

  it("trims text input", () => {
    const result = parseItem("faqs", { question: "  Parken?  ", answer: " Ja " });
    expect(result.ok && result.value).toMatchObject({ question: "Parken?", answer: "Ja" });
  });
});
