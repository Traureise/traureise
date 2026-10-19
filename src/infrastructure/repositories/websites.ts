import { and, asc, eq, sql } from "drizzle-orm";
import type { Item, NewWebsite, Section, SectionPatch, Website, WebsitePatch, WebsiteRepository } from "@/application/ports";
import type { CollectionKind, ItemData, SectionKind } from "@/domain/sections";
import type { Database } from "../db/client";
import { sectionItems, websiteSections, websites } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemRow = typeof sectionItems.$inferSelect;
const toItem = (row: ItemRow): Item => ({ id: row.id, kind: row.kind as CollectionKind, position: row.position, data: row.data as ItemData });
const toSection = (row: typeof websiteSections.$inferSelect): Section => ({
  kind: row.kind as SectionKind,
  title: row.title,
  visible: row.visible,
  body: row.body,
});

export class DrizzleWebsiteRepository implements WebsiteRepository {
  constructor(private db: Database) {}

  async create(input: NewWebsite, sections: Section[]): Promise<Website> {
    return this.db.transaction(async (tx) => {
      const [website] = await tx.insert(websites).values(input).returning();
      if (sections.length > 0) await tx.insert(websiteSections).values(sections.map((s) => ({ ...s, websiteId: website!.id })));
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
    const rows = await this.db.select().from(websiteSections).where(eq(websiteSections.websiteId, websiteId));
    return rows.map(toSection);
  }

  async updateSection(websiteId: string, kind: SectionKind, patch: SectionPatch): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db
      .update(websiteSections)
      .set(patch)
      .where(and(eq(websiteSections.websiteId, websiteId), eq(websiteSections.kind, kind)));
  }

  async listItems(websiteId: string): Promise<Item[]> {
    const rows = await this.db
      .select()
      .from(sectionItems)
      .where(eq(sectionItems.websiteId, websiteId))
      .orderBy(asc(sectionItems.kind), asc(sectionItems.position));
    return rows.map(toItem);
  }

  async findItem(websiteId: string, itemId: string): Promise<Item | null> {
    if (!UUID.test(itemId)) return null;
    const [row] = await this.db
      .select()
      .from(sectionItems)
      .where(and(eq(sectionItems.websiteId, websiteId), eq(sectionItems.id, itemId)));
    return row ? toItem(row) : null;
  }

  async addItem<K extends CollectionKind>(websiteId: string, kind: K, data: ItemData<K>): Promise<Item<K>> {
    const [row] = await this.db
      .insert(sectionItems)
      .values({
        websiteId,
        kind,
        data,
        position: sql`(select coalesce(max(${sectionItems.position}) + 1, 0) from ${sectionItems} where ${sectionItems.websiteId} = ${websiteId} and ${sectionItems.kind} = ${kind})`,
      })
      .returning();
    return toItem(row!) as Item<K>;
  }

  async updateItem<K extends CollectionKind>(itemId: string, data: ItemData<K>): Promise<void> {
    await this.db.update(sectionItems).set({ data }).where(eq(sectionItems.id, itemId));
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.db.delete(sectionItems).where(eq(sectionItems.id, itemId));
  }

  async setItemOrder(websiteId: string, kind: CollectionKind, orderedIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [position, id] of orderedIds.entries()) {
        await tx
          .update(sectionItems)
          .set({ position })
          .where(and(eq(sectionItems.id, id), eq(sectionItems.websiteId, websiteId), eq(sectionItems.kind, kind)));
      }
    });
  }
}
