import { moveItem, type Direction } from "@/domain/ordering";
import {
  SECTION_TITLE_MAX,
  STORY_MAX,
  imageKeysOf,
  isCollectionKind,
  isSectionKind,
  parseItem,
  type CollectionKind,
  type SectionKind,
} from "@/domain/sections";
import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import { assertOwnImage, deleteImage, loadOwnedWebsite } from "./owned";
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

async function loadOwnedItem(deps: Deps, userId: string, websiteId: string, itemId: string): Promise<Item> {
  await loadOwnedWebsite(deps, userId, websiteId);
  const item = await deps.websites.findItem(websiteId, itemId).catch(() => null);
  if (!item) throw new NotFoundError();
  return item;
}

export class AddItem {
  constructor(private deps: Deps) {}

  async execute<K extends CollectionKind>(userId: string, websiteId: string, kind: K, input: unknown): Promise<Item<K>> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    if (!isCollectionKind(kind)) throw new NotFoundError();
    const data = parseOrThrow(kind, input);
    for (const key of imageKeysOf(data)) await assertOwnImage(this.deps, websiteId, key);
    return this.deps.websites.addItem(websiteId, kind, data);
  }
}

export class UpdateItem {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, itemId: string, input: unknown): Promise<void> {
    const item = await loadOwnedItem(this.deps, userId, websiteId, itemId);
    const data = parseOrThrow(item.kind, input);
    const newKeys = imageKeysOf(data);
    for (const key of newKeys) await assertOwnImage(this.deps, websiteId, key);
    await this.deps.websites.updateItem(itemId, data);
    for (const old of imageKeysOf(item.data)) if (!newKeys.includes(old)) await deleteImage(this.deps, old);
  }
}

export class DeleteItem {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, itemId: string): Promise<void> {
    const item = await loadOwnedItem(this.deps, userId, websiteId, itemId);
    await this.deps.websites.deleteItem(itemId);
    for (const key of imageKeysOf(item.data)) await deleteImage(this.deps, key);
  }
}

/** Moves an item one step up or down within its section (spec: ReorderItems). */
export class MoveItem {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, itemId: string, direction: Direction): Promise<void> {
    const item = await loadOwnedItem(this.deps, userId, websiteId, itemId);
    const ids = (await this.deps.websites.listItems(websiteId)).filter((i) => i.kind === item.kind).map((i) => i.id);
    await this.deps.websites.setItemOrder(websiteId, item.kind, moveItem(ids, itemId, direction));
  }
}
