import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type {
  MagicLinkRecord,
  MagicLinkRepository,
  RateLimiter,
  SessionRecord,
  SessionRepository,
} from "@/application/ports";
import type { Database } from "../db/client";
import { magicLinkTokens, rateLimitHits, sessions } from "../db/schema";

export class DrizzleMagicLinkRepository implements MagicLinkRepository {
  constructor(private db: Database) {}

  async create(input: { email: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.db.insert(magicLinkTokens).values(input);
  }

  async findByHash(tokenHash: string): Promise<MagicLinkRecord | null> {
    const row = await this.db.query.magicLinkTokens.findFirst({ where: eq(magicLinkTokens.tokenHash, tokenHash) });
    return row ? { id: row.id, email: row.email, expiresAt: row.expiresAt, usedAt: row.usedAt } : null;
  }

  async markUsed(id: string, at: Date): Promise<boolean> {
    const updated = await this.db
      .update(magicLinkTokens)
      .set({ usedAt: at })
      .where(and(eq(magicLinkTokens.id, id), isNull(magicLinkTokens.usedAt)))
      .returning({ id: magicLinkTokens.id });
    return updated.length === 1;
  }
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private db: Database) {}

  async create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.db.insert(sessions).values(input);
  }

  async findByHash(tokenHash: string): Promise<SessionRecord | null> {
    const row = await this.db.query.sessions.findFirst({ where: eq(sessions.tokenHash, tokenHash) });
    return row ? { id: row.id, userId: row.userId, expiresAt: row.expiresAt } : null;
  }

  async deleteByHash(tokenHash: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
}

export class PostgresRateLimiter implements RateLimiter {
  constructor(private db: Database) {}

  async hit(key: string, limit: number, windowMs: number, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - windowMs);
    return this.db.transaction(async (tx) => {
      await tx.delete(rateLimitHits).where(and(eq(rateLimitHits.key, key), lt(rateLimitHits.createdAt, since)));
      await tx.insert(rateLimitHits).values({ key, createdAt: now });
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(rateLimitHits)
        .where(and(eq(rateLimitHits.key, key), gte(rateLimitHits.createdAt, since)));
      return (row?.count ?? 0) <= limit;
    });
  }
}
