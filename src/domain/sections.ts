import { z } from "zod";
import { imageKey, isoDate, optional, requiredText, text, time24, webUrl } from "./fields";
import { parseWith, type Parsed } from "./result";

/** Fixed section order after Home (reordering is out of scope for v1). */
export const SECTION_KINDS = [
  "our-story",
  "schedule",
  "travel",
  "things-to-do",
  "registry",
  "wedding-party",
  "gallery",
  "faqs",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const COLLECTION_KINDS = SECTION_KINDS.filter((k) => k !== "our-story") as Exclude<SectionKind, "our-story">[];
export type CollectionKind = Exclude<SectionKind, "our-story">;

export function isSectionKind(value: string): value is SectionKind {
  return (SECTION_KINDS as readonly string[]).includes(value);
}

export function isCollectionKind(value: string): value is CollectionKind {
  return isSectionKind(value) && value !== "our-story";
}

export const EVENT_TYPES = [
  "welcome",
  "rehearsal",
  "cocktail",
  "wedding",
  "ceremony",
  "reception",
  "after-party",
  "brunch",
  "other",
] as const;

export const TRAVEL_TYPES = ["hotel", "arrival", "parking", "other"] as const;

/** Roles in the wedding party; labels live in messages (sections.roles.<key>). */
export const PARTY_ROLES = [
  "bride",
  "groom",
  "partner",
  "couple",
  "best-woman",
  "best-man",
  "best-person",
  "maid-of-honor",
  "matron-of-honor",
  "man-of-honor",
  "bridesmaid",
  "bridesman",
  "groomsman",
  "groomswoman",
  "junior-bridesmaid",
  "junior-groomsman",
  "flower-girl",
  "flower-boy",
  "flower-child",
  "ring-bearer",
  "mother-of-bride",
  "father-of-bride",
  "parent-of-bride",
  "mother-of-groom",
  "father-of-groom",
  "parent-of-groom",
  "grandparent",
  "sibling",
  "family",
  "friend",
  "officiant",
  "civil-registrar",
  "celebrant",
  "witness",
  "wedding-planner",
  "master-of-ceremonies",
  "usher",
  "musician",
  "photographer",
  "helper",
] as const;

const scheduleItem = z
  .object({
    imageKey: optional(imageKey).default(null),
    eventType: z.enum(EVENT_TYPES, "invalid_option"),
    name: requiredText(120),
    startDate: isoDate,
    startTime: time24,
    endDate: optional(isoDate).default(null),
    endTime: optional(time24).default(null),
    venueName: text(160),
    address: text(300),
    description: text(2000),
    website: optional(webUrl).default(null),
  })
  .transform((e) => ({ ...e, endDate: e.endTime && !e.endDate ? e.startDate : e.endDate }))
  .superRefine((e, ctx) => {
    if (e.endDate && !e.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "required" });
    if (e.endDate && e.endTime && `${e.endDate}T${e.endTime}` <= `${e.startDate}T${e.startTime}`) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "end_before_start" });
    }
  });

const travelItem = z.object({
  name: requiredText(120),
  type: z.enum(TRAVEL_TYPES, "invalid_option"),
  address: text(300),
  website: optional(webUrl).default(null),
  description: text(2000),
});

const thingToDoItem = z.object({
  name: requiredText(120),
  website: optional(webUrl).default(null),
  description: text(2000),
});

const registryItem = z.object({
  name: requiredText(120),
  url: webUrl,
  description: text(2000),
});

const partyItem = z.object({
  name: requiredText(120),
  role: z.enum(PARTY_ROLES, "invalid_option"),
  imageKey: optional(imageKey).default(null),
});

const galleryItem = z.object({
  imageKey: imageKey,
  caption: text(300),
});

const faqItem = z.object({
  question: requiredText(300),
  answer: requiredText(4000),
  imageKey: optional(imageKey).default(null),
});

export const ITEM_SCHEMAS = {
  schedule: scheduleItem,
  travel: travelItem,
  "things-to-do": thingToDoItem,
  registry: registryItem,
  "wedding-party": partyItem,
  gallery: galleryItem,
  faqs: faqItem,
} as const;

export type ItemData<K extends CollectionKind = CollectionKind> = z.infer<(typeof ITEM_SCHEMAS)[K]>;
export type ScheduleItem = ItemData<"schedule">;
export type TravelItem = ItemData<"travel">;
export type ThingToDoItem = ItemData<"things-to-do">;
export type RegistryItem = ItemData<"registry">;
export type PartyItem = ItemData<"wedding-party">;
export type GalleryItem = ItemData<"gallery">;
export type FaqItem = ItemData<"faqs">;

export function parseItem<K extends CollectionKind>(kind: K, input: unknown): Parsed<ItemData<K>> {
  return parseWith(ITEM_SCHEMAS[kind], input) as Parsed<ItemData<K>>;
}

/** Image keys referenced by an item, for cleanup when items or websites are deleted. */
export function imageKeysOf(data: Record<string, unknown>): string[] {
  const key = data.imageKey;
  return typeof key === "string" ? [key] : [];
}

export const SECTION_TITLE_MAX = 60;
export const STORY_MAX = 10_000;
