import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { GuestImportBatch, GuestRepository, HouseholdData, NewPoll, PollRecord } from "@/application/ports";
import type { AssignableItem, Assignment } from "@/domain/weddings";
import {
  DEFAULT_RSVP_SETTINGS,
  type AnswerSource,
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
import { guestRequests, guests, householdVersions, households, rsvpPolls, rsvpSettings } from "../db/schema";

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
  email: row.email,
});
const toRequest = (row: RequestRow): GuestRequest => ({ id: row.id, name: row.name, status: row.status as RequestStatus, createdAt: row.createdAt, decidedAt: row.decidedAt });

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class DrizzleGuestRepository implements GuestRepository {
  constructor(private db: Database) {}

  async getSettings(weddingId: string): Promise<RsvpSettings> {
    const [row] = await this.db.select().from(rsvpSettings).where(eq(rsvpSettings.weddingId, weddingId));
    if (!row) return { ...DEFAULT_RSVP_SETTINGS };
    return { replyBy: row.replyBy, eventIds: row.eventIds ?? null, meal: row.meal ?? null, notify: row.notify as NotifyMode, whatsappMessage: row.whatsappMessage };
  }

  async saveSettings(weddingId: string, settings: RsvpSettings): Promise<void> {
    await this.db.insert(rsvpSettings).values({ weddingId, ...settings }).onConflictDoUpdate({ target: rsvpSettings.weddingId, set: settings });
  }

  async listPolls(weddingId: string): Promise<PollRecord[]> {
    const rows = await this.db.select().from(rsvpPolls).where(eq(rsvpPolls.weddingId, weddingId)).orderBy(asc(rsvpPolls.position), asc(rsvpPolls.createdAt));
    return rows.map(toPoll);
  }

  async createPoll(weddingId: string, poll: NewPoll): Promise<PollRecord> {
    const [row] = await this.db
      .insert(rsvpPolls)
      .values({ weddingId, ...poll, position: sql`(select coalesce(max(${rsvpPolls.position}), -1) + 1 from ${rsvpPolls} where ${rsvpPolls.weddingId} = ${weddingId})` })
      .returning();
    return toPoll(row!);
  }

  async updatePoll(weddingId: string, pollId: string, poll: NewPoll): Promise<boolean> {
    if (!UUID.test(pollId)) return false;
    const rows = await this.db.update(rsvpPolls).set(poll).where(and(eq(rsvpPolls.id, pollId), eq(rsvpPolls.weddingId, weddingId))).returning({ id: rsvpPolls.id });
    return rows.length > 0;
  }

  async deletePoll(weddingId: string, pollId: string): Promise<void> {
    if (!UUID.test(pollId)) return;
    await this.db.delete(rsvpPolls).where(and(eq(rsvpPolls.id, pollId), eq(rsvpPolls.weddingId, weddingId)));
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
      answeredBy: r.answeredBy ?? null,
      createdAt: r.createdAt,
      personalLine: r.personalLine,
      unsubscribedAt: r.unsubscribedAt,
      people: people.filter((p) => p.householdId === r.id).map(toGuest),
      requests: requests.filter((q) => q.householdId === r.id).map(toRequest),
    }));
  }

  async listHouseholds(weddingId: string): Promise<Household[]> {
    return this.assemble(await this.db.select().from(households).where(eq(households.weddingId, weddingId)).orderBy(asc(households.createdAt), asc(households.id)));
  }

  async findHousehold(weddingId: string, householdId: string): Promise<Household | null> {
    if (!UUID.test(householdId)) return null;
    const rows = await this.db.select().from(households).where(and(eq(households.id, householdId), eq(households.weddingId, weddingId)));
    return (await this.assemble(rows))[0] ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<{ weddingId: string; household: Household } | null> {
    const rows = await this.db.select().from(households).where(eq(households.tokenHash, tokenHash));
    const [household] = await this.assemble(rows);
    return household ? { weddingId: rows[0]!.weddingId, household } : null;
  }

  async createHousehold(weddingId: string, data: HouseholdData, tokenHashFor: (householdId: string) => string): Promise<Household> {
    const id = crypto.randomUUID();
    await this.db.transaction(async (tx) => {
      await tx
        .insert(households)
        .values({ id, weddingId, name: data.name, invitedEventIds: data.invitedEventIds, personalLine: data.personalLine, tokenHash: tokenHashFor(id) });
      await tx.insert(guests).values(data.people.map((p, position) => ({ householdId: id, position, name: p.name, isChild: p.isChild, email: p.email })));
    });
    return (await this.findHousehold(weddingId, id))!;
  }

  async importGuests(weddingId: string, batch: GuestImportBatch, tokenHashFor: (householdId: string) => string): Promise<void> {
    // Anything that does not belong to the wedding throws, which rolls the whole import back.
    await this.db.transaction(async (tx) => {
      for (const household of batch.create) {
        const id = crypto.randomUUID();
        await tx.insert(households).values({ id, weddingId, name: household.name, invitedEventIds: household.invitedEventIds, personalLine: household.personalLine, tokenHash: tokenHashFor(id) });
        await tx.insert(guests).values(household.people.map((p, position) => ({ householdId: id, position, name: p.name, isChild: p.isChild, email: p.email, allergies: p.allergies })));
      }
      for (const join of batch.join) {
        if (!UUID.test(join.householdId)) throw new Error("household not found");
        const [own] = await tx.select({ id: households.id }).from(households).where(and(eq(households.id, join.householdId), eq(households.weddingId, weddingId)))
          .for("update");
        if (!own) throw new Error("household not found");
        const [last] = await tx.select({ position: sql<number>`coalesce(max(${guests.position}), -1)` }).from(guests).where(eq(guests.householdId, join.householdId));
        const start = Number(last!.position) + 1;
        await tx.insert(guests).values(join.people.map((p, i) => ({ householdId: join.householdId, position: start + i, name: p.name, isChild: p.isChild, email: p.email, allergies: p.allergies })));
      }
      for (const o of batch.overwrite) {
        if (!UUID.test(o.guestId)) throw new Error("guest not found");
        const updated = await tx
          .update(guests)
          .set({ name: o.name, isChild: o.isChild, email: o.email, allergies: o.allergies })
          .where(and(eq(guests.id, o.guestId), inArray(guests.householdId, tx.select({ id: households.id }).from(households).where(eq(households.weddingId, weddingId)))))
          .returning({ id: guests.id });
        if (updated.length === 0) throw new Error("guest not found");
      }
    });
  }

  async updateHousehold(weddingId: string, householdId: string, data: HouseholdData): Promise<void> {
    await this.db.transaction(async (tx) => {
      const existing = await tx.select({ id: guests.id, email: guests.email }).from(guests).where(eq(guests.householdId, householdId));
      // A new address (entered by the couple) ends an earlier unsubscribe; keeping or removing addresses does not.
      const before = new Set(existing.flatMap((e) => (e.email ? [e.email] : [])));
      const gainsAddress = data.people.some((p) => p.email && !before.has(p.email));
      const updated = await tx
        .update(households)
        .set({
          name: data.name,
          invitedEventIds: data.invitedEventIds,
          personalLine: data.personalLine,
          ...(gainsAddress ? { unsubscribedAt: null } : {}),
        })
        .where(and(eq(households.id, householdId), eq(households.weddingId, weddingId)))
        .returning({ id: households.id });
      if (updated.length === 0) return;
      const kept = new Set(data.people.map((p) => p.id).filter((id): id is string => !!id));
      const removed = existing.map((e) => e.id).filter((id) => !kept.has(id));
      if (removed.length > 0) await tx.delete(guests).where(inArray(guests.id, removed));
      for (const [position, person] of data.people.entries()) {
        if (person.id && existing.some((e) => e.id === person.id)) {
          await tx.update(guests).set({ name: person.name, isChild: person.isChild, email: person.email, position }).where(and(eq(guests.id, person.id), eq(guests.householdId, householdId)));
        } else {
          await tx.insert(guests).values({ householdId, position, name: person.name, isChild: person.isChild, email: person.email });
        }
      }
    });
  }

  async deleteHousehold(weddingId: string, householdId: string): Promise<void> {
    if (!UUID.test(householdId)) return;
    await this.db.delete(households).where(and(eq(households.id, householdId), eq(households.weddingId, weddingId)));
  }

  async saveResponse(householdId: string, response: HouseholdResponse, at: Date, by: AnswerSource): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const { guestId, ...answer } of response.people) {
        await tx.update(guests).set(answer).where(and(eq(guests.id, guestId), eq(guests.householdId, householdId)));
      }
      await tx.update(households).set({ pollAnswers: response.pollAnswers, message: response.message, respondedAt: at, answeredBy: by }).where(eq(households.id, householdId));
      if (response.requests.length > 0) {
        await tx.insert(guestRequests).values(response.requests.map((name) => ({ householdId, name, createdAt: at })));
      }
    });
  }

  async decideRequest(weddingId: string, requestId: string, status: "added" | "declined", at: Date): Promise<boolean> {
    if (!UUID.test(requestId)) return false;
    return this.db.transaction(async (tx: Tx) => {
      const [request] = await tx
        .update(guestRequests)
        .set({ status, decidedAt: at })
        .where(
          and(
            eq(guestRequests.id, requestId),
            eq(guestRequests.status, "pending"),
            inArray(guestRequests.householdId, tx.select({ id: households.id }).from(households).where(eq(households.weddingId, weddingId))),
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

  async listAssignments(weddingId: string): Promise<Assignment[]> {
    const rows = await this.db
      .select({ householdId: householdVersions.householdId, item: householdVersions.item, cardId: householdVersions.cardId, websiteId: householdVersions.websiteId })
      .from(householdVersions)
      .innerJoin(households, eq(households.id, householdVersions.householdId))
      .where(eq(households.weddingId, weddingId));
    return rows.map((r) => ({ householdId: r.householdId, item: r.item as AssignableItem, versionId: (r.cardId ?? r.websiteId)! }));
  }

  async assign(householdId: string, item: AssignableItem, target: { cardId: string } | { websiteId: string }): Promise<void> {
    const set = "cardId" in target ? { cardId: target.cardId, websiteId: null } : { cardId: null, websiteId: target.websiteId };
    await this.db.insert(householdVersions).values({ householdId, item, ...set }).onConflictDoUpdate({ target: [householdVersions.householdId, householdVersions.item], set });
  }

  async unsubscribe(householdId: string, at: Date): Promise<boolean> {
    if (!UUID.test(householdId)) return false;
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(households)
        .set({ unsubscribedAt: sql`coalesce(${households.unsubscribedAt}, ${at.toISOString()}::timestamptz)` })
        .where(eq(households.id, householdId))
        .returning({ id: households.id });
      if (rows.length === 0) return false;
      await tx.update(guests).set({ email: null }).where(eq(guests.householdId, householdId));
      return true;
    });
  }

  async deleteGuestData(weddingId: string): Promise<number> {
    const rows = await this.db.delete(households).where(eq(households.weddingId, weddingId)).returning({ id: households.id });
    return rows.length;
  }

  async listWeddingIdsWithGuests(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ id: households.weddingId }).from(households);
    return rows.map((r) => r.id);
  }

  async listWeddingIdsWithDailySummary(): Promise<string[]> {
    const rows = await this.db.select({ id: rsvpSettings.weddingId }).from(rsvpSettings).where(eq(rsvpSettings.notify, "daily"));
    return rows.map((r) => r.id);
  }

  async lastSummaryAt(weddingId: string): Promise<Date | null> {
    const [row] = await this.db.select({ at: rsvpSettings.lastSummaryAt }).from(rsvpSettings).where(eq(rsvpSettings.weddingId, weddingId));
    return row?.at ?? null;
  }

  async claimDailySummary(weddingId: string, previous: Date | null, at: Date): Promise<boolean> {
    const unchanged = previous ? eq(rsvpSettings.lastSummaryAt, previous) : sql`${rsvpSettings.lastSummaryAt} is null`;
    const rows = await this.db
      .update(rsvpSettings)
      .set({ lastSummaryAt: at })
      .where(and(eq(rsvpSettings.weddingId, weddingId), unchanged))
      .returning({ id: rsvpSettings.weddingId });
    return rows.length > 0;
  }

  async claimRetentionWarning(weddingId: string, deleteAt: Date): Promise<boolean> {
    const rows = await this.db
      .insert(rsvpSettings)
      .values({ weddingId, retentionWarnedFor: deleteAt })
      .onConflictDoUpdate({
        target: rsvpSettings.weddingId,
        set: { retentionWarnedFor: deleteAt },
        setWhere: sql`${rsvpSettings.retentionWarnedFor} is distinct from ${deleteAt.toISOString()}::timestamptz`,
      })
      .returning({ id: rsvpSettings.weddingId });
    return rows.length > 0;
  }
}
