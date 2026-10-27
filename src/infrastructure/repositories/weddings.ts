import { and, asc, eq, gt, sql } from "drizzle-orm";
import type {
  Invitation,
  InvitationRepository,
  Member,
  NewWedding,
  SlugOwners,
  Wedding,
  WeddingEvent,
  WeddingPatch,
  WeddingRepository,
} from "@/application/ports";
import type { Role } from "@/domain/members";
import { compareEvents, type EventData } from "@/domain/sections";
import type { Database } from "../db/client";
import { sectionBlocks, users, weddingEvents, weddingInvitations, weddingMembers, weddings, websites } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventRow = typeof weddingEvents.$inferSelect;
const toEvent = (row: EventRow): WeddingEvent => ({ id: row.id, data: row.data as EventData });

export class DrizzleWeddingRepository implements WeddingRepository {
  constructor(private db: Database) {}

  async create({ creatorId, ...input }: NewWedding): Promise<Wedding> {
    return this.db.transaction(async (tx) => {
      const [wedding] = await tx
        .insert(weddings)
        .values({ ...input, contactUserId: creatorId })
        .returning();
      await tx.insert(weddingMembers).values({ weddingId: wedding!.id, userId: creatorId, role: "admin" });
      return wedding!;
    });
  }

  async findById(id: string): Promise<Wedding | null> {
    if (!UUID.test(id)) return null;
    return (await this.db.query.weddings.findFirst({ where: eq(weddings.id, id) })) ?? null;
  }

  async findBySlug(slug: string): Promise<Wedding | null> {
    return (await this.db.query.weddings.findFirst({ where: eq(weddings.slug, slug) })) ?? null;
  }

  async listForMember(userId: string): Promise<(Wedding & { role: Role })[]> {
    const rows = await this.db
      .select({ wedding: weddings, role: weddingMembers.role })
      .from(weddingMembers)
      .innerJoin(weddings, eq(weddings.id, weddingMembers.weddingId))
      .where(eq(weddingMembers.userId, userId))
      .orderBy(asc(weddings.createdAt));
    return rows.map((r) => ({ ...r.wedding, role: r.role as Role }));
  }

  async roleOf(weddingId: string, userId: string): Promise<Role | null> {
    if (!UUID.test(weddingId) || !UUID.test(userId)) return null;
    const [row] = await this.db
      .select({ role: weddingMembers.role })
      .from(weddingMembers)
      .where(and(eq(weddingMembers.weddingId, weddingId), eq(weddingMembers.userId, userId)));
    return (row?.role as Role | undefined) ?? null;
  }

  async listMembers(weddingId: string): Promise<Member[]> {
    const rows = await this.db
      .select({ userId: users.id, email: users.email, firstName: users.firstName, role: weddingMembers.role, createdAt: weddingMembers.createdAt })
      .from(weddingMembers)
      .innerJoin(users, eq(users.id, weddingMembers.userId))
      .where(eq(weddingMembers.weddingId, weddingId))
      .orderBy(asc(weddingMembers.createdAt), asc(users.email));
    return rows.map((r) => ({ ...r, role: r.role as Role }));
  }

  async addMember(weddingId: string, userId: string, role: Role): Promise<void> {
    await this.db.insert(weddingMembers).values({ weddingId, userId, role }).onConflictDoNothing();
  }

  async setRole(weddingId: string, userId: string, role: Role): Promise<void> {
    await this.db
      .update(weddingMembers)
      .set({ role })
      .where(and(eq(weddingMembers.weddingId, weddingId), eq(weddingMembers.userId, userId)));
  }

  async removeMember(weddingId: string, userId: string): Promise<void> {
    await this.db.delete(weddingMembers).where(and(eq(weddingMembers.weddingId, weddingId), eq(weddingMembers.userId, userId)));
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
    await this.db.transaction(async (tx) => {
      await tx.delete(sectionBlocks).where(sql`${sectionBlocks.data}->>'type' = 'event' and ${sectionBlocks.data}->>'eventId' = ${eventId}`);
      await tx.delete(weddingEvents).where(eq(weddingEvents.id, eventId));
    });
  }
}

type InvitationRow = typeof weddingInvitations.$inferSelect;
const toInvitation = (row: InvitationRow): Invitation => ({
  id: row.id,
  weddingId: row.weddingId,
  email: row.email,
  role: row.role as Role,
  invitedBy: row.invitedBy,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
});

export class DrizzleInvitationRepository implements InvitationRepository {
  constructor(private db: Database) {}

  async replace(input: Omit<Invitation, "id" | "createdAt"> & { tokenHash: string }): Promise<Invitation> {
    return this.db.transaction(async (tx) => {
      await tx.delete(weddingInvitations).where(and(eq(weddingInvitations.weddingId, input.weddingId), eq(weddingInvitations.email, input.email)));
      const [row] = await tx.insert(weddingInvitations).values(input).returning();
      return toInvitation(row!);
    });
  }

  async findByHash(tokenHash: string): Promise<Invitation | null> {
    const [row] = await this.db.select().from(weddingInvitations).where(eq(weddingInvitations.tokenHash, tokenHash));
    return row ? toInvitation(row) : null;
  }

  async listPending(weddingId: string, now: Date): Promise<Invitation[]> {
    const rows = await this.db
      .select()
      .from(weddingInvitations)
      .where(and(eq(weddingInvitations.weddingId, weddingId), gt(weddingInvitations.expiresAt, now)))
      .orderBy(asc(weddingInvitations.createdAt));
    return rows.map(toInvitation);
  }

  async delete(id: string): Promise<boolean> {
    if (!UUID.test(id)) return false;
    const rows = await this.db.delete(weddingInvitations).where(eq(weddingInvitations.id, id)).returning({ id: weddingInvitations.id });
    return rows.length > 0;
  }
}
