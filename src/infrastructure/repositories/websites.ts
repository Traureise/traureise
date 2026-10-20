import { and, asc, eq, sql } from "drizzle-orm";
import type { Block, NewSection, NewWebsite, Section, SectionPatch, Website, WebsitePatch, WebsiteRepository } from "@/application/ports";
import type { BlockData, BlockType } from "@/domain/sections";
import type { Database } from "../db/client";
import { sectionBlocks, websiteSections, websites } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const toSection = (row: typeof websiteSections.$inferSelect): Section => ({
  id: row.id,
  position: row.position,
  title: row.title,
  visible: row.visible,
  suggestedType: row.suggestedType as BlockType | null,
});
const toBlock = (row: typeof sectionBlocks.$inferSelect): Block => ({
  id: row.id,
  sectionId: row.sectionId,
  position: row.position,
  data: row.data as BlockData,
});

/** Inserts sections (with their blocks) after the website's last section. */
async function insertSections(tx: Tx, websiteId: string, sections: NewSection[]): Promise<Section[]> {
  const [{ next }] = (await tx
    .select({ next: sql<number>`coalesce(max(${websiteSections.position}) + 1, 0)::int` })
    .from(websiteSections)
    .where(eq(websiteSections.websiteId, websiteId))) as [{ next: number }];
  const created: Section[] = [];
  for (const [i, { blocks, ...section }] of sections.entries()) {
    const [row] = await tx
      .insert(websiteSections)
      .values({ ...section, websiteId, position: next + i })
      .returning();
    if (blocks.length > 0) {
      await tx.insert(sectionBlocks).values(blocks.map((data, position) => ({ websiteId, sectionId: row!.id, position, data })));
    }
    created.push(toSection(row!));
  }
  return created;
}

export class DrizzleWebsiteRepository implements WebsiteRepository {
  constructor(private db: Database) {}

  async create(input: NewWebsite, sections: NewSection[]): Promise<Website> {
    return this.db.transaction(async (tx) => {
      const [website] = await tx.insert(websites).values(input).returning();
      await insertSections(tx, website!.id, sections);
      return website!;
    });
  }

  async findById(id: string): Promise<Website | null> {
    if (!UUID.test(id)) return null;
    return (await this.db.query.websites.findFirst({ where: eq(websites.id, id) })) ?? null;
  }

  async findBySlug(slug: string): Promise<Website | null> {
    return (await this.db.query.websites.findFirst({ where: eq(websites.slug, slug) })) ?? null;
  }

  listByWedding(weddingId: string): Promise<Website[]> {
    return this.db.query.websites.findMany({ where: eq(websites.weddingId, weddingId), orderBy: [asc(websites.position), asc(websites.createdAt)] });
  }

  async update(id: string, patch: WebsitePatch): Promise<Website> {
    const [website] = await this.db.update(websites).set(patch).where(eq(websites.id, id)).returning();
    return website!;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(websites).where(eq(websites.id, id));
  }

  async listSections(websiteId: string): Promise<Section[]> {
    const rows = await this.db
      .select()
      .from(websiteSections)
      .where(eq(websiteSections.websiteId, websiteId))
      .orderBy(asc(websiteSections.position));
    return rows.map(toSection);
  }

  async findSection(websiteId: string, sectionId: string): Promise<Section | null> {
    if (!UUID.test(sectionId)) return null;
    const [row] = await this.db
      .select()
      .from(websiteSections)
      .where(and(eq(websiteSections.websiteId, websiteId), eq(websiteSections.id, sectionId)));
    return row ? toSection(row) : null;
  }

  async addSection(websiteId: string, section: NewSection): Promise<Section> {
    const [created] = await this.db.transaction((tx) => insertSections(tx, websiteId, [section]));
    return created!;
  }

  async updateSection(sectionId: string, patch: SectionPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db.update(websiteSections).set(patch).where(eq(websiteSections.id, sectionId));
  }

  async deleteSection(sectionId: string): Promise<void> {
    await this.db.delete(websiteSections).where(eq(websiteSections.id, sectionId));
  }

  async setSectionOrder(websiteId: string, orderedIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [position, id] of orderedIds.entries()) {
        await tx
          .update(websiteSections)
          .set({ position })
          .where(and(eq(websiteSections.id, id), eq(websiteSections.websiteId, websiteId)));
      }
    });
  }

  async listBlocks(websiteId: string): Promise<Block[]> {
    const rows = await this.db
      .select({ block: sectionBlocks })
      .from(sectionBlocks)
      .innerJoin(websiteSections, eq(websiteSections.id, sectionBlocks.sectionId))
      .where(eq(sectionBlocks.websiteId, websiteId))
      .orderBy(asc(websiteSections.position), asc(sectionBlocks.position));
    return rows.map((r) => toBlock(r.block));
  }

  async findBlock(websiteId: string, blockId: string): Promise<Block | null> {
    if (!UUID.test(blockId)) return null;
    const [row] = await this.db
      .select()
      .from(sectionBlocks)
      .where(and(eq(sectionBlocks.websiteId, websiteId), eq(sectionBlocks.id, blockId)));
    return row ? toBlock(row) : null;
  }

  async addBlock(websiteId: string, sectionId: string, data: BlockData): Promise<Block> {
    const [row] = await this.db
      .insert(sectionBlocks)
      .values({
        websiteId,
        sectionId,
        data,
        position: sql`(select coalesce(max(${sectionBlocks.position}) + 1, 0) from ${sectionBlocks} where ${sectionBlocks.sectionId} = ${sectionId})`,
      })
      .returning();
    return toBlock(row!);
  }

  async updateBlock(blockId: string, data: BlockData): Promise<void> {
    await this.db.update(sectionBlocks).set({ data }).where(eq(sectionBlocks.id, blockId));
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.db.delete(sectionBlocks).where(eq(sectionBlocks.id, blockId));
  }

  async setBlockOrder(sectionId: string, orderedIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [position, id] of orderedIds.entries()) {
        await tx
          .update(sectionBlocks)
          .set({ position })
          .where(and(eq(sectionBlocks.id, id), eq(sectionBlocks.sectionId, sectionId)));
      }
    });
  }

  async deleteEventBlocks(eventId: string): Promise<void> {
    await this.db.delete(sectionBlocks).where(sql`${sectionBlocks.data}->>'type' = 'event' and ${sectionBlocks.data}->>'eventId' = ${eventId}`);
  }
}
