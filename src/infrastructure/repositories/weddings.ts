import { asc, eq, sql } from "drizzle-orm";
import type { NewWedding, SlugOwners, Wedding, WeddingEvent, WeddingPatch, WeddingRepository } from "@/application/ports";
import { compareEvents, type EventData } from "@/domain/sections";
import type { Database } from "../db/client";
import { weddingEvents, weddings, websites } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventRow = typeof weddingEvents.$inferSelect;
const toEvent = (row: EventRow): WeddingEvent => ({ id: row.id, data: row.data as EventData });

export class DrizzleWeddingRepository implements WeddingRepository {
  constructor(private db: Database) {}

  async create(input: NewWedding): Promise<Wedding> {
    const [wedding] = await this.db.insert(weddings).values(input).returning();
    return wedding!;
  }

  async findById(id: string): Promise<Wedding | null> {
    if (!UUID.test(id)) return null;
    return (await this.db.query.weddings.findFirst({ where: eq(weddings.id, id) })) ?? null;
  }

  async findBySlug(slug: string): Promise<Wedding | null> {
    return (await this.db.query.weddings.findFirst({ where: eq(weddings.slug, slug) })) ?? null;
  }

  listByOwner(ownerId: string): Promise<Wedding[]> {
    return this.db.query.weddings.findMany({ where: eq(weddings.ownerId, ownerId), orderBy: asc(weddings.createdAt) });
  }

  async update(id: string, patch: WeddingPatch): Promise<Wedding> {
    const [wedding] = await this.db.update(weddings).set(patch).where(eq(weddings.id, id)).returning();
    return wedding!;
  }

  async markUsed(id: string): Promise<void> {
    await this.db.update(weddings).set({ lastOpenedAt: sql`now()` }).where(eq(weddings.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(weddings).where(eq(weddings.id, id));
  }

  async slugOwners(slug: string): Promise<SlugOwners> {
    const [ws, sites] = await Promise.all([
      this.db.select({ id: weddings.id }).from(weddings).where(eq(weddings.slug, slug)),
      this.db.select({ id: websites.id, weddingId: websites.weddingId }).from(websites).where(eq(websites.slug, slug)),
    ]);
    return { weddingIds: ws.map((w) => w.id), websites: sites };
  }

  async listEvents(weddingId: string): Promise<WeddingEvent[]> {
    const rows = await this.db.select().from(weddingEvents).where(eq(weddingEvents.weddingId, weddingId));
    return rows.map(toEvent).sort(compareEvents);
  }

  async findEvent(weddingId: string, eventId: string): Promise<WeddingEvent | null> {
    if (!UUID.test(eventId)) return null;
    const [row] = await this.db.select().from(weddingEvents).where(sql`${weddingEvents.weddingId} = ${weddingId} and ${weddingEvents.id} = ${eventId}`);
    return row ? toEvent(row) : null;
  }

  async addEvent(weddingId: string, data: EventData): Promise<WeddingEvent> {
    const [row] = await this.db.insert(weddingEvents).values({ weddingId, data }).returning();
    return toEvent(row!);
  }

  async updateEvent(eventId: string, data: EventData): Promise<void> {
    await this.db.update(weddingEvents).set({ data }).where(eq(weddingEvents.id, eventId));
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.db.delete(weddingEvents).where(eq(weddingEvents.id, eventId));
  }
}
