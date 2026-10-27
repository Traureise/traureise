import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import type { NewSection } from "@/application/ports";
import { SECTION_TEMPLATES, TEMPLATE_SUGGESTIONS, templateBlocks } from "@/domain/sections";
import { createDatabase, type Database } from "@/infrastructure/db/client";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { DrizzleWeddingRepository } from "@/infrastructure/repositories/weddings";
import { testEnv } from "./env";

/** One connection pool per test file; every test starts with empty tables. */
export function setupTestDatabase() {
  const { db, close } = createDatabase(testEnv().databaseUrl, 3);
  beforeEach(async () => {
    await db.execute(sql`truncate users, magic_link_tokens, sessions, rate_limit_hits, weddings, billing_events cascade`);
  });
  afterAll(close);
  return db;
}

/** The eight template sections, titled with their template keys. */
export const allSections = (): NewSection[] =>
  SECTION_TEMPLATES.map((t) => ({ title: t, visible: true, suggestedType: TEMPLATE_SUGGESTIONS[t], blocks: templateBlocks(t) }));

/** A user with a wedding and its first website version (a draft). */
export async function seedWedding(db: Database, email = "anna@example.org", slug = "anna-und-ben", weddingDate: string | null = "2027-06-12", sections: NewSection[] = allSections()) {
  const user = await new DrizzleUserRepository(db).create(email);
  const wedding = await new DrizzleWeddingRepository(db).create({ creatorId: user.id, slug, title: "Anna & Ben", weddingDate, timezone: "Europe/Berlin" });
  const website = await new DrizzleWebsiteRepository(db).create(
    {
      weddingId: wedding.id,
      label: "Standard",
      position: 0,
      slug,
      published: false,
      welcomeMessage: "",
      hashtag: "",
      showCountdown: false,
      coverImageKey: null,
      themeId: "salbei",
      paletteId: null,
      fontPairingId: null,
    },
    sections,
  );
  return { user, wedding, website };
}
