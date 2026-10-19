import { and, asc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Card, CardRepository, DeliveryRecord, MailChannel, NewCard, OpenRecord, QueuedMail } from "@/application/ports";
import type { CardInput, CardKind, HouseholdCardKind, SharedVia } from "@/domain/cards";
import type { Database } from "../db/client";
import { cardDeliveries, cardOpens, cards, households } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CardRow = typeof cards.$inferSelect;
type DeliveryRow = typeof cardDeliveries.$inferSelect;

const toCard = (row: CardRow): Card => ({
  id: row.id,
  weddingId: row.weddingId,
  kind: row.kind as CardKind,
  label: row.label,
  slug: row.slug,
  position: row.position,
  sharedAt: row.sharedAt,
  themeId: row.themeId,
  paletteId: row.paletteId,
  fontPairingId: row.fontPairingId,
  layoutId: row.layoutId,
  envelope: row.envelope,
  photoKey: row.photoKey,
  content: row.content,
  message: row.message,
  reminderDays: row.reminderDays,
  reminderMessage: row.reminderMessage,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toDelivery = (row: DeliveryRow): DeliveryRecord => ({
  householdId: row.householdId,
  kind: row.kind as HouseholdCardKind,
  excluded: row.excluded,
  sharedAt: row.sharedAt,
  sharedVia: row.sharedVia as SharedVia | null,
  emailQueuedAt: row.emailQueuedAt,
  emailedAt: row.emailedAt,
  emailError: row.emailError,
  reminderOffset: row.reminderOffset,
  reminderQueuedAt: row.reminderQueuedAt,
  remindedAt: row.remindedAt,
  reminderError: row.reminderError,
});

/** The columns of one mail channel: card emails or reminders share one claim pattern. */
const COLUMNS = {
  card: { queued: cardDeliveries.emailQueuedAt, claimed: cardDeliveries.emailClaimedAt, sent: cardDeliveries.emailedAt, error: cardDeliveries.emailError },
  reminder: { queued: cardDeliveries.reminderQueuedAt, claimed: cardDeliveries.reminderClaimedAt, sent: cardDeliveries.remindedAt, error: cardDeliveries.reminderError },
} as const;
const KEYS = {
  card: { queued: "emailQueuedAt", claimed: "emailClaimedAt", sent: "emailedAt", error: "emailError" },
  reminder: { queued: "reminderQueuedAt", claimed: "reminderClaimedAt", sent: "remindedAt", error: "reminderError" },
} as const;

const ofWedding = (weddingId: string) => sql`${cardDeliveries.householdId} in (select ${households.id} from ${households} where ${households.weddingId} = ${weddingId})`;

export class DrizzleCardRepository implements CardRepository {
  constructor(private db: Database) {}

  private one = (householdId: string, kind: HouseholdCardKind) => and(eq(cardDeliveries.householdId, householdId), eq(cardDeliveries.kind, kind));

  /** Creates the delivery row if needed, then applies `set`. */
  private async upsert(householdId: string, kind: HouseholdCardKind, set: Partial<typeof cardDeliveries.$inferInsert>, setWhere?: ReturnType<typeof sql>) {
    return this.db
      .insert(cardDeliveries)
      .values({ householdId, kind, ...set })
      .onConflictDoUpdate({ target: [cardDeliveries.householdId, cardDeliveries.kind], set, setWhere })
      .returning({ householdId: cardDeliveries.householdId });
  }

  async create(card: NewCard): Promise<Card> {
    const [row] = await this.db.insert(cards).values(card).returning();
    return toCard(row!);
  }

  async findById(cardId: string): Promise<Card | null> {
    if (!UUID.test(cardId)) return null;
    const [row] = await this.db.select().from(cards).where(eq(cards.id, cardId));
    return row ? toCard(row) : null;
  }

  async listByWedding(weddingId: string): Promise<Card[]> {
    return (await this.db.select().from(cards).where(eq(cards.weddingId, weddingId)).orderBy(asc(cards.position), asc(cards.createdAt))).map(toCard);
  }

  async update(cardId: string, input: CardInput): Promise<void> {
    await this.db.update(cards).set(input).where(eq(cards.id, cardId));
  }

  async rename(cardId: string, label: string): Promise<void> {
    await this.db.update(cards).set({ label }).where(eq(cards.id, cardId));
  }

  async delete(cardId: string): Promise<void> {
    await this.db.delete(cards).where(eq(cards.id, cardId));
  }

  async markLinkShared(cardId: string, at: Date): Promise<void> {
    await this.db.update(cards).set({ sharedAt: at }).where(and(eq(cards.id, cardId), isNull(cards.sharedAt)));
  }

  async listDeliveries(weddingId: string): Promise<DeliveryRecord[]> {
    return (await this.db.select().from(cardDeliveries).where(ofWedding(weddingId))).map(toDelivery);
  }

  async listDeliveriesOfHousehold(householdId: string): Promise<DeliveryRecord[]> {
    if (!UUID.test(householdId)) return [];
    return (await this.db.select().from(cardDeliveries).where(eq(cardDeliveries.householdId, householdId))).map(toDelivery);
  }

  async setExcluded(householdId: string, kind: HouseholdCardKind, excluded: boolean): Promise<void> {
    await this.upsert(householdId, kind, { excluded });
  }

  async markShared(householdId: string, kind: HouseholdCardKind, via: SharedVia, at: Date): Promise<void> {
    await this.upsert(householdId, kind, { sharedAt: at, sharedVia: via }, sql`${cardDeliveries.sharedAt} is null`);
  }

  async listOpens(weddingId: string): Promise<OpenRecord[]> {
    return this.db
      .select({ cardId: cardOpens.cardId, householdId: cardOpens.householdId, openedAt: cardOpens.openedAt })
      .from(cardOpens)
      .innerJoin(cards, eq(cards.id, cardOpens.cardId))
      .where(eq(cards.weddingId, weddingId));
  }

  async listOpensOfHousehold(householdId: string): Promise<OpenRecord[]> {
    if (!UUID.test(householdId)) return [];
    return this.db.select().from(cardOpens).where(eq(cardOpens.householdId, householdId));
  }

  async markOpened(cardId: string, householdId: string, at: Date): Promise<boolean> {
    const rows = await this.db.insert(cardOpens).values({ cardId, householdId, openedAt: at }).onConflictDoNothing().returning({ cardId: cardOpens.cardId });
    return rows.length > 0;
  }

  async queueMail(channel: MailChannel, kind: HouseholdCardKind, householdIds: string[], at: Date): Promise<number> {
    const c = COLUMNS[channel];
    const k = KEYS[channel];
    let queued = 0;
    for (const householdId of householdIds) {
      const rows = await this.upsert(householdId, kind, { [k.queued]: at, [k.error]: null }, sql`${c.claimed} is null`);
      queued += rows.length;
    }
    return queued;
  }

  async listQueuedMail(limit: number, weddingId?: string): Promise<QueuedMail[]> {
    const result: QueuedMail[] = [];
    for (const channel of ["card", "reminder"] as const) {
      const c = COLUMNS[channel];
      const rows = await this.db
        .select({ householdId: cardDeliveries.householdId, kind: cardDeliveries.kind, weddingId: households.weddingId })
        .from(cardDeliveries)
        .innerJoin(households, eq(households.id, cardDeliveries.householdId))
        .where(and(isNotNull(c.queued), isNull(c.claimed), weddingId ? eq(households.weddingId, weddingId) : undefined))
        .orderBy(c.queued)
        .limit(limit - result.length);
      result.push(...rows.map((r) => ({ ...r, kind: r.kind as HouseholdCardKind, channel })));
      if (result.length >= limit) break;
    }
    return result;
  }

  async claimMail(channel: MailChannel, householdId: string, kind: HouseholdCardKind, at: Date): Promise<boolean> {
    const c = COLUMNS[channel];
    const rows = await this.db
      .update(cardDeliveries)
      .set({ [KEYS[channel].claimed]: at })
      .where(and(this.one(householdId, kind), isNotNull(c.queued), isNull(c.claimed)))
      .returning({ householdId: cardDeliveries.householdId });
    return rows.length > 0;
  }

  async finishMail(channel: MailChannel, householdId: string, kind: HouseholdCardKind, outcome: { sentAt: Date } | { error: string }): Promise<void> {
    const k = KEYS[channel];
    const done = "sentAt" in outcome ? { [k.sent]: outcome.sentAt, [k.error]: null } : { [k.error]: outcome.error };
    await this.db
      .update(cardDeliveries)
      .set({ [k.queued]: null, [k.claimed]: null, ...done })
      .where(this.one(householdId, kind));
  }

  async failStaleClaims(before: Date): Promise<number> {
    let failed = 0;
    for (const channel of ["card", "reminder"] as const) {
      const k = KEYS[channel];
      const rows = await this.db
        .update(cardDeliveries)
        .set({ [k.queued]: null, [k.claimed]: null, [k.error]: "interrupted" })
        .where(lt(COLUMNS[channel].claimed, before))
        .returning({ householdId: cardDeliveries.householdId });
      failed += rows.length;
    }
    return failed;
  }

  async claimAutomaticReminder(householdId: string, offset: number, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(cardDeliveries)
      .set({ reminderOffset: offset, remindedAt: at })
      .where(and(this.one(householdId, "invitation"), or(isNull(cardDeliveries.reminderOffset), gt(cardDeliveries.reminderOffset, offset))))
      .returning({ householdId: cardDeliveries.householdId });
    return rows.length > 0;
  }

  async listWeddingIdsWithReminders(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ weddingId: cards.weddingId })
      .from(cards)
      .where(and(eq(cards.kind, "invitation"), sql`jsonb_array_length(${cards.reminderDays}) > 0`));
    return rows.map((r) => r.weddingId);
  }
}
