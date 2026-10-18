import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Every piece of user data hangs off users.id with ON DELETE CASCADE, so deleting an
// account (next iteration) is a single delete.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  createdAt: createdAt(),
});

export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("magic_link_tokens_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rate_limit_hits_key_idx").on(t.key, t.createdAt)],
);

export const websites = pgTable(
  "websites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    weddingDate: date("wedding_date", { mode: "string" }),
    location: text("location"),
    welcomeMessage: text("welcome_message").notNull().default(""),
    hashtag: text("hashtag").notNull().default(""),
    showCountdown: boolean("show_countdown").notNull().default(false),
    coverImageKey: text("cover_image_key"),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    themeId: text("theme_id").notNull(),
    paletteId: text("palette_id"),
    fontPairingId: text("font_pairing_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [index("websites_owner_idx").on(t.ownerId)],
);

export const websiteSections = pgTable(
  "website_sections",
  {
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    // null = use the translated default title for this section kind.
    title: text("title"),
    visible: boolean("visible").notNull().default(true),
    body: text("body").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.websiteId, t.kind] })],
);

export const sectionItems = pgTable(
  "section_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    position: integer("position").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [index("section_items_website_kind_idx").on(t.websiteId, t.kind, t.position)],
);

export const uploads = pgTable("uploads", {
  key: text("key").primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: createdAt(),
});
