import { and, eq, isNull } from "drizzle-orm";
import type { BillingChange, BillingRepository, EntitlementRecord } from "@/application/ports";
import type { PaidTier } from "@/domain/billing";
import type { Database } from "../db/client";
import { billingEvents, entitlements, websites } from "../db/schema";

type Row = typeof entitlements.$inferSelect;
const toRecord = (row: Row): EntitlementRecord => ({ ...row, tier: row.tier as PaidTier });

export class DrizzleBillingRepository implements BillingRepository {
  constructor(private db: Database) {}

  async applyEvent(eventId: string, change: BillingChange): Promise<"applied" | "duplicate"> {
    // The event id and its effect commit together: if applying fails, the provider's retry is not mistaken for a replay.
    return this.db.transaction(async (tx) => {
      const recorded = await tx.insert(billingEvents).values({ id: eventId }).onConflictDoNothing().returning({ id: billingEvents.id });
      if (recorded.length === 0) return "duplicate";
      if (change.kind === "grant") {
        const { websiteId, tier, purchaseRef, provider, validUntil } = change;
        await tx.insert(entitlements).values({ websiteId, tier, purchaseRef, provider, validUntil }).onConflictDoNothing({ target: entitlements.purchaseRef });
      } else if (change.kind === "revoke") {
        await tx
          .update(entitlements)
          .set({ revokedAt: change.at })
          .where(and(eq(entitlements.purchaseRef, change.purchaseRef), isNull(entitlements.revokedAt)));
      }
      return "applied";
    });
  }

  async listByWebsite(websiteId: string): Promise<EntitlementRecord[]> {
    const rows = await this.db.select().from(entitlements).where(eq(entitlements.websiteId, websiteId)).orderBy(entitlements.createdAt);
    return rows.map(toRecord);
  }

  async listByOwner(ownerId: string): Promise<EntitlementRecord[]> {
    const rows = await this.db
      .select({ entitlement: entitlements })
      .from(entitlements)
      .innerJoin(websites, eq(websites.id, entitlements.websiteId))
      .where(eq(websites.ownerId, ownerId))
      .orderBy(entitlements.createdAt);
    return rows.map((r) => toRecord(r.entitlement));
  }
}
