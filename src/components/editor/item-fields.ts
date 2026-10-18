import { EVENT_TYPES, PARTY_ROLES, TRAVEL_TYPES, type CollectionKind } from "@/domain/sections";

export type FieldType = "text" | "textarea" | "date" | "time" | "url" | "select" | "image";
export type FieldSpec = { name: string; type: FieldType; options?: readonly string[]; optionLabels?: string; required?: boolean };

/** Form layout per collection section; labels come from editor.fields.<name>. */
export const ITEM_FIELDS: Record<CollectionKind, FieldSpec[]> = {
  schedule: [
    { name: "imageKey", type: "image" },
    { name: "eventType", type: "select", options: EVENT_TYPES, optionLabels: "sections.eventTypes", required: true },
    { name: "name", type: "text", required: true },
    { name: "startDate", type: "date", required: true },
    { name: "startTime", type: "time", required: true },
    { name: "endDate", type: "date" },
    { name: "endTime", type: "time" },
    { name: "venueName", type: "text" },
    { name: "address", type: "textarea" },
    { name: "description", type: "textarea" },
    { name: "website", type: "url" },
  ],
  travel: [
    { name: "name", type: "text", required: true },
    { name: "type", type: "select", options: TRAVEL_TYPES, optionLabels: "sections.travelTypes", required: true },
    { name: "address", type: "textarea" },
    { name: "website", type: "url" },
    { name: "description", type: "textarea" },
  ],
  "things-to-do": [
    { name: "name", type: "text", required: true },
    { name: "website", type: "url" },
    { name: "description", type: "textarea" },
  ],
  registry: [
    { name: "name", type: "text", required: true },
    { name: "url", type: "url", required: true },
    { name: "description", type: "textarea" },
  ],
  "wedding-party": [
    { name: "name", type: "text", required: true },
    { name: "role", type: "select", options: PARTY_ROLES, optionLabels: "sections.roles", required: true },
    { name: "imageKey", type: "image" },
  ],
  gallery: [
    { name: "imageKey", type: "image", required: true },
    { name: "caption", type: "text" },
  ],
  faqs: [
    { name: "question", type: "text", required: true },
    { name: "answer", type: "textarea", required: true },
    { name: "imageKey", type: "image" },
  ],
};

/** The line that identifies an item in the editor list. */
export function itemHeadline(kind: CollectionKind, data: Record<string, unknown>): string {
  const value = kind === "gallery" ? data.caption : kind === "faqs" ? data.question : data.name;
  return typeof value === "string" ? value : "";
}
