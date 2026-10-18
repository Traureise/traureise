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

// One row per purchase. purchase_ref is the provider's order id and stays unique after a refund,
// so a replayed payment event can never grant the same purchase twice.
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    tier: text("tier").notNull(),
    provider: text("provider").notNull(),
    purchaseRef: text("purchase_ref").notNull().unique(),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("entitlements_website_idx").on(t.websiteId)],
);

/** Ids of payment-provider events already handled (webhook idempotency). No personal data. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// Guests and RSVP. Everything hangs off the website (ON DELETE CASCADE), so deleting a website or an
// account removes the guest list; retention deletes the households, which takes people, answers and requests along.
export const rsvpSettings = pgTable("rsvp_settings", {
  websiteId: uuid("website_id")
    .primaryKey()
    .references(() => websites.id, { onDelete: "cascade" }),
  replyBy: date("reply_by", { mode: "string" }),
  // null = every schedule item.
  eventIds: jsonb("event_ids").$type<string[] | null>(),
  meal: jsonb("meal").$type<{ eventId: string | null; options: { id: string; label: string }[] } | null>(),
  notify: text("notify").notNull().default("off"),
  whatsappMessage: text("whatsapp_message"),
  lastSummaryAt: timestamp("last_summary_at", { withTimezone: true }),
  retentionWarnedFor: timestamp("retention_warned_for", { withTimezone: true }),
});

export const rsvpPolls = pgTable(
  "rsvp_polls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    question: text("question").notNull(),
    multiple: boolean("multiple").notNull().default(false),
    allowOther: boolean("allow_other").notNull().default(false),
    per: text("per").notNull().default("person"),
    options: jsonb("options").$type<{ id: string; label: string }[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rsvp_polls_website_idx").on(t.websiteId, t.position)],
);

type PollAnswersJson = Record<string, { optionIds: string[]; other: string | null }>;

export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Hash of the personal link's token; the token itself is derived from the id and never stored.
    tokenHash: text("token_hash").notNull().unique(),
    // null = every RSVP event.
    invitedEventIds: jsonb("invited_event_ids").$type<string[] | null>(),
    message: text("message").notNull().default(""),
    pollAnswers: jsonb("poll_answers").$type<PollAnswersJson>().notNull().default({}),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("households_website_idx").on(t.websiteId, t.createdAt)],
);

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    isChild: boolean("is_child").notNull().default(false),
    attending: boolean("attending"),
    eventIds: jsonb("event_ids").$type<string[]>().notNull().default([]),
    mealOptionId: text("meal_option_id"),
    allergies: text("allergies").notNull().default(""),
    pollAnswers: jsonb("poll_answers").$type<PollAnswersJson>().notNull().default({}),
    fromRequest: boolean("from_request").notNull().default(false),
  },
  (t) => [index("guests_household_idx").on(t.householdId, t.position)],
);

export const guestRequests = pgTable(
  "guest_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("guest_requests_household_idx").on(t.householdId)],
);
