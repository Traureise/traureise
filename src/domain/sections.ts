import { z } from "zod";
import { bothOrNeither, bothOrNeitherError, imageKey, isoDate, latitude, longitude, optional, requiredText, text, time24, webUrl } from "./fields";
import { parseWith, type FieldErrors, type Parsed } from "./result";

/** The standard template: today's eight sections in their default order. */
export const SECTION_TEMPLATES = [
  "our-story",
  "schedule",
  "travel",
  "things-to-do",
  "registry",
  "wedding-party",
  "gallery",
  "faqs",
] as const;
export type SectionTemplate = (typeof SECTION_TEMPLATES)[number];

export function isSectionTemplate(value: unknown): value is SectionTemplate {
  return typeof value === "string" && (SECTION_TEMPLATES as readonly string[]).includes(value);
}

/** The fixed block kinds a section is built from; each has its own designed layout on the site. */
export const BLOCK_TYPES = ["text", "event", "person", "place", "link", "faq", "image"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && (BLOCK_TYPES as readonly string[]).includes(value);
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

export const PLACE_TYPES = ["hotel", "parking", "arrival", "activity", "other"] as const;

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

const eventSchema = z
  .object({
    imageKey: optional(imageKey).default(null),
    eventType: z.enum(EVENT_TYPES, "invalid_option"),
    name: requiredText(120),
    // Empty is "required", not "invalid" (a half-typed native date input also submits "").
    startDate: z.string().min(1, "required").pipe(isoDate),
    startTime: z.string().min(1, "required").pipe(time24),
    endDate: optional(isoDate).default(null),
    endTime: optional(time24).default(null),
    venueName: text(160),
    address: text(300),
    description: text(2000),
    website: optional(webUrl).default(null),
    // Where the place was picked on the map; both or neither.
    latitude,
    longitude,
  })
  .refine(bothOrNeither, bothOrNeitherError)
  .transform((e) => ({ ...e, endDate: e.endTime && !e.endDate ? e.startDate : e.endDate }));

export type EventData = z.infer<typeof eventSchema>;

/**
 * Start/end consistency, checked on the raw input so it is reported together with any other
 * field errors (zod skips refinements once a field has failed).
 */
function scheduleTimeErrors(input: unknown): FieldErrors {
  const raw = (input ?? {}) as Record<string, unknown>;
  const valid = (schema: z.ZodType, key: string) => {
    const value = typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
    return value && schema.safeParse(value).success ? value : null;
  };
  const startDate = valid(isoDate, "startDate");
  const startTime = valid(time24, "startTime");
  const endTime = valid(time24, "endTime");
  const endDate = valid(isoDate, "endDate") ?? (endTime ? startDate : null);
  if (endDate && !endTime) return { endTime: "required" };
  if (startDate && startTime && endDate && endTime && `${endDate}T${endTime}` <= `${startDate}T${startTime}`) {
    return { endTime: "end_before_start" };
  }
  return {};
}

export function parseEvent(input: unknown): Parsed<EventData> {
  const result = parseWith(eventSchema, input);
  const extra = scheduleTimeErrors(input);
  if (Object.keys(extra).length === 0) return result;
  return { ok: false, fieldErrors: { ...extra, ...(result.ok ? {} : result.fieldErrors) } };
}

/** Events are always listed chronologically: by date, then start time. */
export function compareEvents(a: { data: EventData }, b: { data: EventData }): number {
  return `${a.data.startDate}T${a.data.startTime}`.localeCompare(`${b.data.startDate}T${b.data.startTime}`);
}

export const TEXT_MAX = 10_000;

const blockSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ type: z.literal("text"), text: requiredText(TEXT_MAX) }),
    /** `eventId: null` shows all events of the wedding. */
    z.object({ type: z.literal("event"), eventId: z.guid("invalid_option").nullable() }),
    z.object({
      type: z.literal("person"),
      name: requiredText(120),
      role: z.enum(PARTY_ROLES, "invalid_option"),
      imageKey: optional(imageKey).default(null),
      text: text(2000),
    }),
    z.object({
      type: z.literal("place"),
      name: requiredText(120),
      placeType: z.enum(PLACE_TYPES, "invalid_option"),
      address: text(300),
      website: optional(webUrl).default(null),
      description: text(2000),
    }),
    z.object({ type: z.literal("link"), name: requiredText(120), url: webUrl, description: text(2000) }),
    z.object({
      type: z.literal("faq"),
      question: requiredText(300),
      answer: requiredText(4000),
      imageKey: optional(imageKey).default(null),
    }),
    z.object({ type: z.literal("image"), imageKey: imageKey, caption: text(300) }),
  ],
  "invalid_option",
);

type AnyBlock = z.infer<typeof blockSchema>;
export type BlockData<T extends BlockType = BlockType> = Extract<AnyBlock, { type: T }>;

export function parseBlock(input: unknown): Parsed<BlockData> {
  return parseWith(blockSchema, input);
}

/** The block kind each template section offers first in its empty editor. */
export const TEMPLATE_SUGGESTIONS: Record<SectionTemplate, BlockType> = {
  "our-story": "text",
  schedule: "event",
  travel: "place",
  "things-to-do": "place",
  registry: "link",
  "wedding-party": "person",
  gallery: "image",
  faqs: "faq",
};

/** Template sections start empty, except the schedule, which shows all events. */
export function templateBlocks(template: SectionTemplate): BlockData[] {
  return template === "schedule" ? [{ type: "event", eventId: null }] : [];
}

/** Consecutive blocks of the same type render together (one grid, one list). */
export function groupBlocks<B extends { data: { type: BlockType } }>(blocks: B[]): B[][] {
  const groups: B[][] = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    if (last && last[0]!.data.type === block.data.type) last.push(block);
    else groups.push([block]);
  }
  return groups;
}

/** Image keys referenced by a block or event, for cleanup when they or websites are deleted. */
export function imageKeysOf(data: Record<string, unknown>): string[] {
  const key = data.imageKey;
  return typeof key === "string" ? [key] : [];
}

export const SECTION_TITLE_MAX = 60;
