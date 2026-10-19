import { moveItem, type Direction } from "@/domain/ordering";
import {
  SECTION_TITLE_MAX,
  STORY_MAX,
  imageKeysOf,
  isCollectionKind,
  isSectionKind,
  parseItem,
  type CollectionKind,
  type ItemData,
  type SectionKind,
} from "@/domain/sections";
import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import { assertOwnImage, loadOwnedWebsite, releaseImages } from "./owned";
import type { Item, SectionPatch } from "./ports";

export class UpdateSection {
  constructor(private deps: Deps) {}

  async execute(
    userId: string,
    websiteId: string,
    kind: SectionKind,
    input: { title?: string | null; visible?: boolean; body?: string },
  ): Promise<void> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    if (!isSectionKind(kind)) throw new NotFoundError();

    const patch: SectionPatch = {};
    if (input.title !== undefined) {
      const title = input.title?.trim() ?? "";
      if (title.length > SECTION_TITLE_MAX) throw new ValidationError({ title: "too_long" });
      patch.title = title === "" ? null : title;
    }
    if (input.visible !== undefined) patch.visible = input.visible;
    if (input.body !== undefined) {
      if (kind !== "our-story") throw new ValidationError({ body: "not_allowed" });
      const body = input.body.trim();
      if (body.length > STORY_MAX) throw new ValidationError({ body: "too_long" });
      patch.body = body;
    }
    await this.deps.websites.updateSection(websiteId, kind, patch);
  }
}

function parseOrThrow<K extends CollectionKind>(kind: K, input: unknown) {
  const parsed = parseItem(kind, input);
  if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
  return parsed.value;
}

/**
 * An item of a website version, or one of the wedding's events (the schedule belongs to the wedding, so editing
 * it in one version changes it for all; each version only chooses which events it shows).
 */
async function loadOwnedItem(deps: Deps, userId: string, websiteId: string, itemId: string) {
  const { wedding } = await loadOwnedWebsite(deps, userId, websiteId);
  const item = (await deps.websites.findItem(websiteId, itemId).catch(() => null)) ?? (await deps.weddings.findEvent(wedding.id, itemId).catch(() => null));
  if (!item) throw new NotFoundError();
  return { wedding, item: item as Item };
}

export class AddItem {
  constructor(private deps: Deps) {}

  async execute<K extends CollectionKind>(userId: string, websiteId: string, kind: K, input: unknown): Promise<Item<K>> {
    const { wedding } = await loadOwnedWebsite(this.deps, userId, websiteId);
    if (!isCollectionKind(kind)) throw new NotFoundError();
    const data = parseOrThrow(kind, input);
    for (const key of imageKeysOf(data)) await assertOwnImage(this.deps, wedding.id, key);
    if (kind === "schedule") return (await this.addEvent(wedding.id, data as ItemData<"schedule">)) as Item<K>;
    return this.deps.websites.addItem(websiteId, kind, data);
  }

  /** The wedding's first event also fills the invitations that have none yet (there was nothing to choose before). */
  private async addEvent(weddingId: string, data: ItemData<"schedule">) {
    const event = await this.deps.weddings.addEvent(weddingId, data);
    if ((await this.deps.weddings.listEvents(weddingId)).length > 1) return event;
    for (const card of await this.deps.cards.listByWedding(weddingId)) {
      if (card.kind !== "invitation" || card.content.eventId) continue;
      const { themeId, paletteId, fontPairingId, layoutId, envelope, photoKey, content, message, reminderDays, reminderMessage } = card;
      await this.deps.cards.update(card.id, { themeId, paletteId, fontPairingId, layoutId, envelope, photoKey, content: { ...content, eventId: event.id }, message, reminderDays, reminderMessage });
    }
    return event;
  }
}

export class UpdateItem {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, itemId: string, input: unknown): Promise<void> {
    const { wedding, item } = await loadOwnedItem(this.deps, userId, websiteId, itemId);
    const data = parseOrThrow(item.kind, input);
    const newKeys = imageKeysOf(data);
    for (const key of newKeys) await assertOwnImage(this.deps, wedding.id, key);
    if (item.kind === "schedule") await this.deps.weddings.updateEvent(itemId, data as ItemData<"schedule">);
    else await this.deps.websites.updateItem(itemId, data);
    await releaseImages(this.deps, wedding.id, imageKeysOf(item.data).filter((old) => !newKeys.includes(old)));
  }
}

export class DeleteItem {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, itemId: string): Promise<void> {
    const { wedding, item } = await loadOwnedItem(this.deps, userId, websiteId, itemId);
    if (item.kind === "schedule") await this.deps.weddings.deleteEvent(itemId);
    else await this.deps.websites.deleteItem(itemId);
    await releaseImages(this.deps, wedding.id, imageKeysOf(item.data));
  }
}

/** Moves an item one step up or down within its section (spec: ReorderItems). */
export class MoveItem {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, itemId: string, direction: Direction): Promise<void> {
    const { wedding, item } = await loadOwnedItem(this.deps, userId, websiteId, itemId);
    if (item.kind === "schedule") {
      const ids = (await this.deps.weddings.listEvents(wedding.id)).map((e) => e.id);
      await this.deps.weddings.setEventOrder(wedding.id, moveItem(ids, itemId, direction));
      return;
    }
    const ids = (await this.deps.websites.listItems(websiteId)).filter((i) => i.kind === item.kind).map((i) => i.id);
    await this.deps.websites.setItemOrder(websiteId, item.kind, moveItem(ids, itemId, direction));
  }
}
