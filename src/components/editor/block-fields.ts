import type { WeddingEvent } from "@/application/ports";
import { germanDate } from "@/domain/days";
import { EVENT_TYPES, PARTY_ROLES, PLACE_TYPES, type BlockData, type BlockType } from "@/domain/sections";

export type FieldType = "text" | "textarea" | "date" | "time" | "url" | "select" | "image" | "location";
export type FieldGroup = "what" | "when" | "where" | "more";
/** `half`: shares a row with its neighbour on wide screens. `group`: the fieldset it belongs to (editor.fieldGroups). */
export type FieldSpec = { name: string; type: FieldType; options?: readonly string[]; optionLabels?: string; required?: boolean; half?: boolean; group?: FieldGroup };

/** Form layout per block type; labels come from editor.fields.<name>. Event blocks have their own form. */
export const BLOCK_FIELDS: Record<Exclude<BlockType, "event">, FieldSpec[]> = {
  text: [{ name: "text", type: "textarea", required: true }],
  person: [
    { name: "name", type: "text", required: true },
    { name: "role", type: "select", options: PARTY_ROLES, optionLabels: "sections.roles", required: true },
    { name: "imageKey", type: "image" },
    { name: "text", type: "textarea" },
  ],
  place: [
    { name: "name", type: "text", required: true },
    { name: "placeType", type: "select", options: PLACE_TYPES, optionLabels: "sections.placeTypes", required: true },
    { name: "address", type: "textarea" },
    { name: "website", type: "url" },
    { name: "description", type: "textarea" },
  ],
  link: [
    { name: "name", type: "text", required: true },
    { name: "url", type: "url", required: true },
    { name: "description", type: "textarea" },
  ],
  faq: [
    { name: "question", type: "text", required: true },
    { name: "answer", type: "textarea", required: true },
    { name: "imageKey", type: "image" },
  ],
  image: [
    { name: "imageKey", type: "image", required: true },
    { name: "caption", type: "text" },
  ],
};

/** An event of the Ablauf. */
export const EVENT_FIELDS: FieldSpec[] = [
  { name: "eventType", type: "select", options: EVENT_TYPES, optionLabels: "sections.eventTypes", required: true, half: true, group: "what" },
  { name: "name", type: "text", required: true, half: true, group: "what" },
  { name: "startDate", type: "date", required: true, half: true, group: "when" },
  { name: "startTime", type: "time", required: true, half: true, group: "when" },
  { name: "endDate", type: "date", half: true, group: "when" },
  { name: "endTime", type: "time", half: true, group: "when" },
  { name: "location", type: "location", group: "where" },
  { name: "venueName", type: "text", half: true, group: "where" },
  { name: "website", type: "url", half: true, group: "where" },
  { name: "address", type: "textarea", group: "where" },
  { name: "description", type: "textarea", group: "more" },
  { name: "imageKey", type: "image", group: "more" },
];


/** An event's line in pickers and lists: name · date · time. */
export const eventLine = ({ data: e }: WeddingEvent) => `${e.name} · ${germanDate(e.startDate)} · ${e.startTime}`;

/**
 * The line that identifies a block in the editor list. Empty for "Alle Termine" (the component names it) and for
 * an event that no longer exists.
 */
export function blockHeadline(data: BlockData, events: WeddingEvent[]): string {
  switch (data.type) {
    case "text":
      return data.text.split("\n")[0]!;
    case "event": {
      const event = data.eventId ? events.find((e) => e.id === data.eventId) : undefined;
      return event ? eventLine(event) : "";
    }
    case "faq":
      return data.question;
    case "image":
      return data.caption;
    default:
      return data.name;
  }
}
