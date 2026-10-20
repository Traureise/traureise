import { moveItem, type Direction } from "@/domain/ordering";
import {
  SECTION_TEMPLATES,
  SECTION_TITLE_MAX,
  TEMPLATE_SUGGESTIONS,
  imageKeysOf,
  isSectionTemplate,
  parseBlock,
  templateBlocks,
  type SectionTemplate,
} from "@/domain/sections";
import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import { assertOwnImage, loadOwnedWebsite, releaseImages } from "./owned";
import type { Block, NewSection, Section, SectionPatch, SiteTexts, Wedding } from "./ports";

/** A section of the standard template, with its translated default title and default blocks. */
export function templateSection(texts: SiteTexts, template: SectionTemplate): NewSection {
  return { title: texts.sectionTitles[template], visible: true, suggestedType: TEMPLATE_SUGGESTIONS[template], blocks: templateBlocks(template) };
}

/** The standard template: what a new wedding's first website and "Aus Vorlage erstellen" start with. */
export const standardSections = (texts: SiteTexts): NewSection[] => SECTION_TEMPLATES.map((t) => templateSection(texts, t));

async function loadOwnedSection(deps: Deps, userId: string, websiteId: string, sectionId: string) {
  const owned = await loadOwnedWebsite(deps, userId, websiteId);
  const section = await deps.websites.findSection(websiteId, sectionId).catch(() => null);
  if (!section) throw new NotFoundError();
  return { ...owned, section };
}

async function loadOwnedBlock(deps: Deps, userId: string, websiteId: string, blockId: string) {
  const owned = await loadOwnedWebsite(deps, userId, websiteId);
  const block = await deps.websites.findBlock(websiteId, blockId).catch(() => null);
  if (!block) throw new NotFoundError();
  return { ...owned, block };
}

/** Parses block input; photos must be the wedding's, and an event block may only point to one of its events. */
async function validBlock(deps: Deps, wedding: Wedding, input: unknown) {
  const parsed = parseBlock(input);
  if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
  const data = parsed.value;
  for (const key of imageKeysOf(data)) await assertOwnImage(deps, wedding.id, key);
  if (data.type === "event" && data.eventId && !(await deps.weddings.findEvent(wedding.id, data.eventId))) {
    throw new ValidationError({ eventId: "invalid_option" });
  }
  return data;
}

export class AddSection {
  constructor(private deps: Deps) {}

  /** "+ Abschnitt": an empty section, or one section of the standard template. Appended at the end. */
  async execute(userId: string, websiteId: string, input: { template: SectionTemplate | null }): Promise<Section> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    const { template } = input;
    if (template !== null && !isSectionTemplate(template)) throw new ValidationError({ template: "invalid_option" });
    const section: NewSection = template
      ? templateSection(this.deps.siteTexts, template)
      : { title: this.deps.siteTexts.newSectionTitle, visible: true, suggestedType: null, blocks: [] };
    return this.deps.websites.addSection(websiteId, section);
  }
}

export class UpdateSection {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, sectionId: string, input: { title?: string; visible?: boolean }): Promise<void> {
    await loadOwnedSection(this.deps, userId, websiteId, sectionId);
    const patch: SectionPatch = {};
    if (input.visible !== undefined && typeof input.visible !== "boolean") throw new ValidationError({ visible: "invalid_option" });
    if (input.title !== undefined) {
      const title = typeof input.title === "string" ? input.title.trim() : "";
      if (title === "") throw new ValidationError({ title: "required" });
      if (title.length > SECTION_TITLE_MAX) throw new ValidationError({ title: "too_long" });
      patch.title = title;
    }
    if (input.visible !== undefined) patch.visible = input.visible;
    await this.deps.websites.updateSection(sectionId, patch);
  }
}

export class DeleteSection {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, sectionId: string): Promise<void> {
    const { wedding } = await loadOwnedSection(this.deps, userId, websiteId, sectionId);
    const photos = (await this.deps.websites.listBlocks(websiteId)).filter((b) => b.sectionId === sectionId).flatMap((b) => imageKeysOf(b.data));
    await this.deps.websites.deleteSection(sectionId);
    await releaseImages(this.deps, wedding.id, photos);
  }
}

/** Moves a section one step up or down; the site navigation follows. */
export class MoveSection {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, sectionId: string, direction: Direction): Promise<void> {
    await loadOwnedSection(this.deps, userId, websiteId, sectionId);
    const ids = (await this.deps.websites.listSections(websiteId)).map((s) => s.id);
    await this.deps.websites.setSectionOrder(websiteId, moveItem(ids, sectionId, direction));
  }
}

export class AddBlock {
  constructor(private deps: Deps) {}

  /** Appends a block of any type to the end of a section. */
  async execute(userId: string, websiteId: string, sectionId: string, input: unknown): Promise<Block> {
    const { wedding } = await loadOwnedSection(this.deps, userId, websiteId, sectionId);
    const data = await validBlock(this.deps, wedding, input);
    return this.deps.websites.addBlock(websiteId, sectionId, data);
  }
}

export class UpdateBlock {
  constructor(private deps: Deps) {}

  /** Edits a block's fields; its type stays. */
  async execute(userId: string, websiteId: string, blockId: string, input: unknown): Promise<void> {
    const { wedding, block } = await loadOwnedBlock(this.deps, userId, websiteId, blockId);
    const data = await validBlock(this.deps, wedding, input);
    if (data.type !== block.data.type) throw new ValidationError({ type: "invalid_option" });
    await this.deps.websites.updateBlock(blockId, data);
    const newKeys = imageKeysOf(data);
    await releaseImages(this.deps, wedding.id, imageKeysOf(block.data).filter((old) => !newKeys.includes(old)));
  }
}

export class DeleteBlock {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, blockId: string): Promise<void> {
    const { wedding, block } = await loadOwnedBlock(this.deps, userId, websiteId, blockId);
    await this.deps.websites.deleteBlock(blockId);
    await releaseImages(this.deps, wedding.id, imageKeysOf(block.data));
  }
}

/** Moves a block one step up or down within its section. */
export class MoveBlock {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, blockId: string, direction: Direction): Promise<void> {
    const { block } = await loadOwnedBlock(this.deps, userId, websiteId, blockId);
    const ids = (await this.deps.websites.listBlocks(websiteId)).filter((b) => b.sectionId === block.sectionId).map((b) => b.id);
    await this.deps.websites.setBlockOrder(block.sectionId, moveItem(ids, blockId, direction));
  }
}
