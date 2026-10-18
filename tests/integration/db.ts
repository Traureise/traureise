import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { createDatabase } from "@/infrastructure/db/client";
import { testEnv } from "./env";

/** One connection pool per test file; every test starts with empty tables. */
export function setupTestDatabase() {
  const { db, close } = createDatabase(testEnv().databaseUrl, 3);
  beforeEach(async () => {
    await db.execute(sql`truncate users, magic_link_tokens, sessions, rate_limit_hits, websites, website_sections, section_items, uploads cascade`);
  });
  afterAll(close);
  return db;
}
