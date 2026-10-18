import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { GuestRepository, HouseholdData, NewPoll, PollRecord } from "@/application/ports";
import {
  DEFAULT_RSVP_SETTINGS,
  type Guest,
  type GuestRequest,
  type Household,
  type HouseholdResponse,
  type NotifyMode,
  type PollScope,
  type RequestStatus,
  type RsvpSettings,
} from "@/domain/guests";
import type { Database } from "../db/client";
import { guestRequests, guests, households, rsvpPolls, rsvpSettings } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type HouseholdRow = typeof households.$inferSelect;
type GuestRow = typeof guests.$inferSelect;
type RequestRow = typeof guestRequests.$inferSelect;
type PollRow = typeof rsvpPolls.$inferSelect;

const toPoll = (row: PollRow): PollRecord => ({
  id: row.id,
  position: row.position,
  question: row.question,
  multiple: row.multiple,
  allowOther: row.allowOther,
  per: row.per as PollScope,
  options: row.options,
});
const toGuest = (row: GuestRow): Guest => ({
  id: row.id,
  name: row.name,
  isChild: row.isChild,
  attending: row.attending,
  eventIds: row.eventIds,
  mealOptionId: row.mealOptionId,
  allergies: row.allergies,
  pollAnswers: row.pollAnswers,
  fromRequest: row.fromRequest,
});
const toRequest = (row: RequestRow): GuestRequest => ({ id: row.id, name: row.name, status: row.status as RequestStatus, createdAt: row.createdAt, decidedAt: row.decidedAt });

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class DrizzleGuestRepository implements GuestRepository {
  constructor(private db: Database) {}

  async getSettings(websiteId: string): Promise<RsvpSettings> {
    const [row] = await this.db.select().from(rsvpSettings).where(eq(rsvpSettings.websiteId, websiteId));
    if (!row) return { ...DEFAULT_RSVP_SETTINGS };
    return { replyBy: row.replyBy, eventIds: row.eventIds ?? null, meal: row.meal ?? null, notify: row.notify as NotifyMode, whatsappMessage: row.whatsappMessage };
  }

  async saveSettings(websiteId: string, settings: RsvpSettings): Promise<void> {
    await this.db.insert(rsvpSettings).values({ websiteId, ...settings }).onConflictDoUpdate({ target: rsvpSettings.websiteId, set: settings });
  }

  async listPolls(websiteId: string): Promise<PollRecord[]> {
    const rows = await this.db.select().from(rsvpPolls).where(eq(rsvpPolls.websiteId, websiteId)).orderBy(asc(rsvpPolls.position), asc(rsvpPolls.createdAt));
    return rows.map(toPoll);
  }

  async createPoll(websiteId: string, poll: NewPoll): Promise<PollRecord> {
    const [row] = await this.db
      .insert(rsvpPolls)
      .values({ websiteId, ...poll, position: sql`(select coalesce(max(${rsvpPolls.position}), -1) + 1 from ${rsvpPolls} where ${rsvpPolls.websiteId} = ${websiteId})` })
      .returning();
    return toPoll(row!);
  }

  async updatePoll(websiteId: string, pollId: string, poll: NewPoll): Promise<boolean> {
    if (!UUID.test(pollId)) return false;
    const rows = await this.db.update(rsvpPolls).set(poll).where(and(eq(rsvpPolls.id, pollId), eq(rsvpPolls.websiteId, websiteId))).returning({ id: rsvpPolls.id });
    return rows.length > 0;
  }

  async deletePoll(websiteId: string, pollId: string): Promise<void> {
    if (!UUID.test(pollId)) return;
    await this.db.delete(rsvpPolls).where(and(eq(rsvpPolls.id, pollId), eq(rsvpPolls.websiteId, websiteId)));
  }

  /** Loads households with their people and requests in three queries. */
  private async assemble(rows: HouseholdRow[]): Promise<Household[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [people, requests] = await Promise.all([
      this.db.select().from(guests).where(inArray(guests.householdId, ids)).orderBy(asc(guests.position)),
      this.db.select().from(guestRequests).where(inArray(guestRequests.householdId, ids)).orderBy(asc(guestRequests.createdAt)),
    ]);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      invitedEventIds: r.invitedEventIds ?? null,
      message: r.message,
      pollAnswers: r.pollAnswers,
      respondedAt: r.respondedAt,
      createdAt: r.createdAt,
      people: people.filter((p) => p.householdId === r.id).map(toGuest),
      requests: requests.filter((q) => q.householdId === r.id).map(toRequest),
    }));
  }

  async listHouseholds(websiteId: string): Promise<Household[]> {
    return this.assemble(await this.db.select().from(households).where(eq(households.websiteId, websiteId)).orderBy(asc(households.createdAt), asc(households.id)));
  }

  async findHousehold(websiteId: string, householdId: string): Promise<Household | null> {
    if (!UUID.test(householdId)) return null;
    const rows = await this.db.select().from(households).where(and(eq(households.id, householdId), eq(households.websiteId, websiteId)));
    return (await this.assemble(rows))[0] ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<{ websiteId: string; household: Household } | null> {
    const rows = await this.db.select().from(households).where(eq(households.tokenHash, tokenHash));
    const [household] = await this.assemble(rows);
    return household ? { websiteId: rows[0]!.websiteId, household } : null;
  }

  async createHousehold(websiteId: string, data: HouseholdData, tokenHashFor: (householdId: string) => string): Promise<Household> {
    const id = crypto.randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.insert(households).values({ id, websiteId, name: data.name, invitedEventIds: data.invitedEventIds, tokenHash: tokenHashFor(id) });
      await tx.insert(guests).values(data.people.map((p, position) => ({ householdId: id, position, name: p.name, isChild: p.isChild })));
    });
    return (await this.findHousehold(websiteId, id))!;
  }

  async updateHousehold(websiteId: string, householdId: string, data: HouseholdData): Promise<void> {
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(households)
        .set({ name: data.name, invitedEventIds: data.invitedEventIds })
        .where(and(eq(households.id, householdId), eq(households.websiteId, websiteId)))
        .returning({ id: households.id });
      if (updated.length === 0) return;
      const existing = await tx.select({ id: guests.id }).from(guests).where(eq(guests.householdId, householdId));
      const kept = new Set(data.people.map((p) => p.id).filter((id): id is string => !!id));
      const removed = existing.map((e) => e.id).filter((id) => !kept.has(id));
      if (removed.length > 0) await tx.delete(guests).where(inArray(guests.id, removed));
      for (const [position, person] of data.people.entries()) {
        if (person.id && existing.some((e) => e.id === person.id)) {
          await tx.update(guests).set({ name: person.name, isChild: person.isChild, position }).where(and(eq(guests.id, person.id), eq(guests.householdId, householdId)));
        } else {
          await tx.insert(guests).values({ householdId, position, name: person.name, isChild: person.isChild });
        }
      }
    });
  }

  async deleteHousehold(websiteId: string, householdId: string): Promise<void> {
    if (!UUID.test(householdId)) return;
    await this.db.delete(households).where(and(eq(households.id, householdId), eq(households.websiteId, websiteId)));
  }

  async saveResponse(householdId: string, response: HouseholdResponse, at: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const { guestId, ...answer } of response.people) {
        await tx.update(guests).set(answer).where(and(eq(guests.id, guestId), eq(guests.householdId, householdId)));
      }
      await tx.update(households).set({ pollAnswers: response.pollAnswers, message: response.message, respondedAt: at }).where(eq(households.id, householdId));
      if (response.requests.length > 0) {
        await tx.insert(guestRequests).values(response.requests.map((name) => ({ householdId, name, createdAt: at })));
      }
    });
  }

  async decideRequest(websiteId: string, requestId: string, status: "added" | "declined", at: Date): Promise<boolean> {
    if (!UUID.test(requestId)) return false;
    return this.db.transaction(async (tx: Tx) => {
      const [request] = await tx
        .update(guestRequests)
        .set({ status, decidedAt: at })
        .where(
          and(
            eq(guestRequests.id, requestId),
            eq(guestRequests.status, "pending"),
            inArray(guestRequests.householdId, tx.select({ id: households.id }).from(households).where(eq(households.websiteId, websiteId))),
          ),
        )
        .returning();
      if (!request) return false;
      if (status === "added") {
        await tx.insert(guests).values({
          householdId: request.householdId,
          name: request.name,
          fromRequest: true,
          position: sql`(select coalesce(max(${guests.position}), -1) + 1 from ${guests} where ${guests.householdId} = ${request.householdId})`,
        });
      }
      return true;
    });
  }

  async deleteGuestData(websiteId: string): Promise<number> {
    const rows = await this.db.delete(households).where(eq(households.websiteId, websiteId)).returning({ id: households.id });
    return rows.length;
  }

  async listWebsiteIdsWithGuests(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ id: households.websiteId }).from(households);
    return rows.map((r) => r.id);
  }

  async listWebsiteIdsWithDailySummary(): Promise<string[]> {
    const rows = await this.db.select({ id: rsvpSettings.websiteId }).from(rsvpSettings).where(eq(rsvpSettings.notify, "daily"));
    return rows.map((r) => r.id);
  }

  async lastSummaryAt(websiteId: string): Promise<Date | null> {
    const [row] = await this.db.select({ at: rsvpSettings.lastSummaryAt }).from(rsvpSettings).where(eq(rsvpSettings.websiteId, websiteId));
    return row?.at ?? null;
  }

  async claimDailySummary(websiteId: string, previous: Date | null, at: Date): Promise<boolean> {
    const unchanged = previous ? eq(rsvpSettings.lastSummaryAt, previous) : sql`${rsvpSettings.lastSummaryAt} is null`;
    const rows = await this.db
      .update(rsvpSettings)
      .set({ lastSummaryAt: at })
      .where(and(eq(rsvpSettings.websiteId, websiteId), unchanged))
      .returning({ id: rsvpSettings.websiteId });
    return rows.length > 0;
  }

  async claimRetentionWarning(websiteId: string, deleteAt: Date): Promise<boolean> {
    const rows = await this.db
      .insert(rsvpSettings)
      .values({ websiteId, retentionWarnedFor: deleteAt })
      .onConflictDoUpdate({
        target: rsvpSettings.websiteId,
        set: { retentionWarnedFor: deleteAt },
        setWhere: sql`${rsvpSettings.retentionWarnedFor} is distinct from ${deleteAt.toISOString()}::timestamptz`,
      })
      .returning({ id: rsvpSettings.websiteId });
    return rows.length > 0;
  }
}
