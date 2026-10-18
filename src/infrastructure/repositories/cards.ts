import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Card, CardRepository, DeliveryRecord, MailChannel, NewCard, QueuedMail } from "@/application/ports";
import type { CardInput, CardKind, SharedVia } from "@/domain/cards";
import type { Database } from "../db/client";
import { cardDeliveries, cards } from "../db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CardRow = typeof cards.$inferSelect;
type DeliveryRow = typeof cardDeliveries.$inferSelect;

const toCard = (row: CardRow): Card => ({
  id: row.id,
  websiteId: row.websiteId,
  kind: row.kind as CardKind,
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
  cardId: row.cardId,
  householdId: row.householdId,
  excluded: row.excluded,
  sharedAt: row.sharedAt,
  sharedVia: row.sharedVia as SharedVia | null,
  emailQueuedAt: row.emailQueuedAt,
  emailedAt: row.emailedAt,
  emailError: row.emailError,
  openedAt: row.openedAt,
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

export class DrizzleCardRepository implements CardRepository {
  constructor(private db: Database) {}

  private one = (cardId: string, householdId: string) => and(eq(cardDeliveries.cardId, cardId), eq(cardDeliveries.householdId, householdId));

  /** Creates the delivery row if needed, then applies `set`. */
  private async upsert(cardId: string, householdId: string, set: Partial<typeof cardDeliveries.$inferInsert>, setWhere?: ReturnType<typeof sql>) {
    return this.db
      .insert(cardDeliveries)
      .values({ cardId, householdId, ...set })
      .onConflictDoUpdate({ target: [cardDeliveries.cardId, cardDeliveries.householdId], set, setWhere })
      .returning({ cardId: cardDeliveries.cardId });
  }

  async create(card: NewCard): Promise<Card | null> {
    const [row] = await this.db.insert(cards).values(card).onConflictDoNothing({ target: [cards.websiteId, cards.kind] }).returning();
    return row ? toCard(row) : null;
  }

  async find(websiteId: string, kind: CardKind): Promise<Card | null> {
    const [row] = await this.db.select().from(cards).where(and(eq(cards.websiteId, websiteId), eq(cards.kind, kind)));
    return row ? toCard(row) : null;
  }

  async listByWebsite(websiteId: string): Promise<Card[]> {
    return (await this.db.select().from(cards).where(eq(cards.websiteId, websiteId))).map(toCard);
  }

  async update(websiteId: string, kind: CardKind, input: CardInput): Promise<void> {
    await this.db.update(cards).set(input).where(and(eq(cards.websiteId, websiteId), eq(cards.kind, kind)));
  }

  async delete(websiteId: string, kind: CardKind): Promise<void> {
    await this.db.delete(cards).where(and(eq(cards.websiteId, websiteId), eq(cards.kind, kind)));
  }

  async listDeliveries(cardId: string): Promise<DeliveryRecord[]> {
    return (await this.db.select().from(cardDeliveries).where(eq(cardDeliveries.cardId, cardId))).map(toDelivery);
  }

  async listDeliveriesOfHousehold(householdId: string): Promise<DeliveryRecord[]> {
    if (!UUID.test(householdId)) return [];
    return (await this.db.select().from(cardDeliveries).where(eq(cardDeliveries.householdId, householdId))).map(toDelivery);
  }

  async setExcluded(cardId: string, householdId: string, excluded: boolean): Promise<void> {
    await this.upsert(cardId, householdId, { excluded });
  }

  async markShared(cardId: string, householdId: string, via: SharedVia, at: Date): Promise<void> {
    await this.upsert(cardId, householdId, { sharedAt: at, sharedVia: via }, sql`${cardDeliveries.sharedAt} is null`);
  }

  async markOpened(cardId: string, householdId: string, at: Date): Promise<boolean> {
    return (await this.upsert(cardId, householdId, { openedAt: at }, sql`${cardDeliveries.openedAt} is null`)).length > 0;
  }

  async queueMail(channel: MailChannel, cardId: string, householdIds: string[], at: Date): Promise<number> {
    const c = COLUMNS[channel];
    const k = KEYS[channel];
    let queued = 0;
    for (const householdId of householdIds) {
      const rows = await this.upsert(cardId, householdId, { [k.queued]: at, [k.error]: null }, sql`${c.claimed} is null`);
      queued += rows.length;
    }
    return queued;
  }

  async listQueuedMail(limit: number, websiteId?: string): Promise<QueuedMail[]> {
    const result: QueuedMail[] = [];
    for (const channel of ["card", "reminder"] as const) {
      const c = COLUMNS[channel];
      const rows = await this.db
        .select({ cardId: cardDeliveries.cardId, householdId: cardDeliveries.householdId, websiteId: cards.websiteId })
        .from(cardDeliveries)
        .innerJoin(cards, eq(cards.id, cardDeliveries.cardId))
        .where(and(isNotNull(c.queued), isNull(c.claimed), websiteId ? eq(cards.websiteId, websiteId) : undefined))
        .orderBy(c.queued)
        .limit(limit - result.length);
      result.push(...rows.map((r) => ({ ...r, channel })));
      if (result.length >= limit) break;
    }
    return result;
  }

  async claimMail(channel: MailChannel, cardId: string, householdId: string, at: Date): Promise<boolean> {
    const c = COLUMNS[channel];
    const rows = await this.db
      .update(cardDeliveries)
      .set({ [KEYS[channel].claimed]: at })
      .where(and(this.one(cardId, householdId), isNotNull(c.queued), isNull(c.claimed)))
      .returning({ cardId: cardDeliveries.cardId });
    return rows.length > 0;
  }

  async finishMail(channel: MailChannel, cardId: string, householdId: string, outcome: { sentAt: Date } | { error: string }): Promise<void> {
    const k = KEYS[channel];
    const done = "sentAt" in outcome ? { [k.sent]: outcome.sentAt, [k.error]: null } : { [k.error]: outcome.error };
    await this.db
      .update(cardDeliveries)
      .set({ [k.queued]: null, [k.claimed]: null, ...done })
      .where(this.one(cardId, householdId));
  }

  async failStaleClaims(before: Date): Promise<number> {
    let failed = 0;
    for (const channel of ["card", "reminder"] as const) {
      const k = KEYS[channel];
      const rows = await this.db
        .update(cardDeliveries)
        .set({ [k.queued]: null, [k.claimed]: null, [k.error]: "interrupted" })
        .where(lt(COLUMNS[channel].claimed, before))
        .returning({ cardId: cardDeliveries.cardId });
      failed += rows.length;
    }
    return failed;
  }

  async claimAutomaticReminder(cardId: string, householdId: string, offset: number, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(cardDeliveries)
      .set({ reminderOffset: offset, remindedAt: at })
      .where(and(this.one(cardId, householdId), or(isNull(cardDeliveries.reminderOffset), gt(cardDeliveries.reminderOffset, offset))))
      .returning({ cardId: cardDeliveries.cardId });
    return rows.length > 0;
  }

  async listInvitationsWithReminders(): Promise<{ websiteId: string; cardId: string }[]> {
    return this.db
      .select({ websiteId: cards.websiteId, cardId: cards.id })
      .from(cards)
      .where(and(eq(cards.kind, "invitation"), sql`jsonb_array_length(${cards.reminderDays}) > 0`));
  }
}

