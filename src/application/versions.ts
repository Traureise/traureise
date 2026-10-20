import { slugify } from "@/domain/slug";
import { isAssignableItem, isVersionItem, parseVersionLabel, VERSION_FEATURES, type AssignableItem, type VersionItem } from "@/domain/weddings";
import { imageKeysOf } from "@/domain/sections";
import type { Deps } from "./deps";
import { LockedError, NotFoundError, ValidationError } from "./errors";
import { loadGuestContext, type GuestContext } from "./guest-context";
import { loadOwnedWedding, releaseImages } from "./owned";
import type { Card, NewSection, Website } from "./ports";
import { standardSections } from "./sections";
import { uniqueSlug } from "./slugs";

type Version = { id: string; label: string; position: number };

/** A version's own fields, without what the database assigns. */
function fieldsOf<T extends { id: string; createdAt: Date; updatedAt: Date; sharedAt?: Date | null }>(version: T): Omit<T, "id" | "createdAt" | "updatedAt" | "sharedAt"> {
  const copy: Partial<T> = { ...version };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.sharedAt;
  return copy as Omit<T, "id" | "createdAt" | "updatedAt" | "sharedAt">;
}

function parseLabel(input: unknown): string {
  const parsed = parseVersionLabel(input);
  if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
  return parsed.value;
}

async function load(deps: Deps, userId: string, weddingId: string, item: string) {
  if (!isVersionItem(item)) throw new NotFoundError();
  const wedding = await loadOwnedWedding(deps, userId, weddingId);
  return { wedding, item, ctx: await loadGuestContext(deps, wedding) };
}

/** The versions of an item in a wedding, first first. */
const versionsOf = (ctx: GuestContext, item: VersionItem): (Card | Website)[] => (item === "website" ? ctx.websites : ctx.versionsOf(item));

/** A version of this wedding and item, or NotFoundError (someone else's, or another item's, looks missing). */
function findVersion(ctx: GuestContext, item: VersionItem, versionId: string): Card | Website {
  const version = versionsOf(ctx, item).find((v) => v.id === versionId);
  if (!version) throw new NotFoundError();
  return version;
}

export class AddVersion {
  constructor(private deps: Deps) {}

  /**
   * "+ Version": a copy of an existing version (by default the first) under a new name, for another audience.
   * Extra versions are paid per item (VERSION_FEATURES); a new website version starts as a draft with its own address.
   * A website version `fromTemplate` takes only the source's design and starts with the standard template's sections.
   */
  async execute(
    userId: string,
    weddingId: string,
    item: VersionItem,
    input: { label: unknown; copyFrom: string | null; fromTemplate?: boolean },
  ): Promise<Version> {
    const { wedding, ctx } = await load(this.deps, userId, weddingId, item);
    if (!ctx.can(VERSION_FEATURES[item])) throw new LockedError();
    const label = parseLabel(input.label);
    const versions = versionsOf(ctx, item);
    const source = input.copyFrom ? findVersion(ctx, item, input.copyFrom) : versions[0];
    if (!source) throw new NotFoundError();
    const position = Math.max(-1, ...versions.map((v) => v.position)) + 1;

    if (item === "website") {
      const site = source as Website;
      const slug = await uniqueSlug(this.deps, `${wedding.slug}-${slugify(label)}`, { wedding: weddingId, website: null });
      const sections = input.fromTemplate ? standardSections(this.deps.siteTexts) : await this.copySections(site.id);
      return this.deps.websites.create({ ...fieldsOf(site), label, position, slug, published: false }, sections);
    }

    const card = source as Card;
    const taken = new Set(versions.map((v) => (v as Card).slug));
    const base = slugify(label);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    return this.deps.cards.create({ ...fieldsOf(card), label, slug, position });
  }

  /** The sections with their blocks, in order. Event blocks keep pointing to the wedding's events. */
  private async copySections(websiteId: string): Promise<NewSection[]> {
    const [sections, blocks] = await Promise.all([this.deps.websites.listSections(websiteId), this.deps.websites.listBlocks(websiteId)]);
    return sections.map(({ title, visible, suggestedType, id }) => ({
      title,
      visible,
      suggestedType,
      blocks: blocks.filter((b) => b.sectionId === id).map((b) => b.data),
    }));
  }
}

export class RenameVersion {
  constructor(private deps: Deps) {}

  /** The name only; the engagement version's link and a website version's address stay. */
  async execute(userId: string, weddingId: string, item: VersionItem, versionId: string, input: unknown): Promise<void> {
    const { ctx } = await load(this.deps, userId, weddingId, item);
    findVersion(ctx, item, versionId);
    const label = parseLabel(input);
    if (item === "website") await this.deps.websites.update(versionId, { label });
    else await this.deps.cards.rename(versionId, label);
  }
}

export class DeleteVersion {
  constructor(private deps: Deps) {}

  /**
   * Deletes a version, never the last one of an item. Its households fall back to the first remaining version
   * (their choice goes with the version) and keep their status, which counts per item.
   */
  async execute(userId: string, weddingId: string, item: VersionItem, versionId: string): Promise<void> {
    const { ctx } = await load(this.deps, userId, weddingId, item);
    const version = findVersion(ctx, item, versionId);
    if (versionsOf(ctx, item).length <= 1) throw new ValidationError({ _: "last_version" });
    if (item === "website") {
      const site = version as Website;
      const photos = [site.coverImageKey, ...(await this.deps.websites.listBlocks(site.id)).flatMap((b) => imageKeysOf(b.data))];
      await this.deps.websites.delete(site.id);
      await releaseImages(this.deps, weddingId, photos);
    } else {
      await this.deps.cards.delete(version.id);
      await releaseImages(this.deps, weddingId, [(version as Card).photoKey]);
    }
  }
}

export class AssignVersion {
  constructor(private deps: Deps) {}

  /** On the guest list: which version of an item a household gets. Both must belong to this wedding. */
  async execute(userId: string, weddingId: string, householdId: string, item: AssignableItem, versionId: string): Promise<void> {
    if (!isAssignableItem(item)) throw new NotFoundError();
    const { ctx } = await load(this.deps, userId, weddingId, item);
    if (!(await this.deps.guests.findHousehold(weddingId, householdId))) throw new NotFoundError();
    findVersion(ctx, item, versionId);
    await this.deps.guests.assign(householdId, item, item === "website" ? { websiteId: versionId } : { cardId: versionId });
  }
}
