import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// A user's own rows (sessions, memberships) hang off users.id with ON DELETE CASCADE. Weddings belong to their
// members (wedding_members), not to one user: deleting an account leaves weddings and their photos in place.
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

// The wedding owns everything a couple makes: website versions, cards, guests, packages and uploads.
export const weddings = pgTable(
  "weddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Reply-to of the mail guests get. A member; falls back to an admin when that person leaves.
    contactUserId: uuid("contact_user_id").references(() => users.id, { onDelete: "set null" }),
    // Carries the links that are not a website (/<slug>/verlobung, /<slug>/hochzeit.ics). Shares one namespace with
    // the website versions' slugs, checked by the application.
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    weddingDate: date("wedding_date", { mode: "string" }),
    location: text("location"),
    // Where the place is on the map, both or neither (picked on the Hochzeit tab).
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
);

// Who may work on a wedding, and as what (admin or editor). Access to a wedding is a membership.
export const weddingMembers = pgTable(
  "wedding_members",
  {
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.weddingId, t.userId] }),
    index("wedding_members_user_idx").on(t.userId),
    check("wedding_members_role_valid", sql`${t.role} IN ('admin', 'editor')`),
  ],
);

// A pending invitation to become a member. Inviting the same address again replaces it.
export const weddingInvitations = pgTable(
  "wedding_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("wedding_invitations_wedding_email_idx").on(t.weddingId, t.email),
    check("wedding_invitations_role_valid", sql`${t.role} IN ('admin', 'editor')`),
  ],
);

// A version of the wedding's website, for an audience. A draft until published.
export const websites = pgTable(
  "websites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    slug: text("slug").notNull().unique(),
    published: boolean("published").notNull().default(false),
    welcomeMessage: text("welcome_message").notNull().default(""),
    hashtag: text("hashtag").notNull().default(""),
    showCountdown: boolean("show_countdown").notNull().default(false),
    coverImageKey: text("cover_image_key"),
    themeId: text("theme_id").notNull(),
    paletteId: text("palette_id"),
    fontPairingId: text("font_pairing_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [index("websites_wedding_idx").on(t.weddingId, t.position)],
);

// A website version's sections, in order: a title plus an ordered list of typed blocks.
export const websiteSections = pgTable(
  "website_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    visible: boolean("visible").notNull().default(true),
    // The block type a template section offers first while it is empty.
    suggestedType: text("suggested_type"),
  },
  (t) => [index("website_sections_website_idx").on(t.websiteId, t.position)],
);

// The blocks of a section. Event blocks reference the wedding's events (data.eventId), never copy them.
export const sectionBlocks = pgTable(
  "section_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    websiteId: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => websiteSections.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [index("section_blocks_section_idx").on(t.sectionId, t.position)],
);

// The schedule ("Ablauf"): shared by the website versions, the invitations and the response form.
// Always listed chronologically, so there is no position.
export const weddingEvents = pgTable(
  "wedding_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    data: jsonb("data").notNull(),
  },
  (t) => [index("wedding_events_wedding_idx").on(t.weddingId)],
);

export const uploads = pgTable(
  "uploads",
  {
    key: text("key").primaryKey(),
    // Who uploaded it. The photo belongs to the wedding and stays when that account is deleted.
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    weddingId: uuid("wedding_id").references(() => weddings.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_wedding_idx").on(t.weddingId)],
);

// One row per purchase. purchase_ref is the provider's order id and stays unique after a refund,
// so a replayed payment event can never grant the same purchase twice.
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    tier: text("tier").notNull(),
    provider: text("provider").notNull(),
    purchaseRef: text("purchase_ref").notNull().unique(),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    purchasedBy: uuid("purchased_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("entitlements_wedding_idx").on(t.weddingId)],
);

/** Ids of payment-provider events already handled (webhook idempotency). No personal data. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// Guests and RSVP. Everything hangs off the wedding (ON DELETE CASCADE), so deleting a wedding or an
// account removes the guest list; retention deletes the households, which takes people, answers, requests,
// deliveries, opens and version choices along.
export const rsvpSettings = pgTable("rsvp_settings", {
  weddingId: uuid("wedding_id")
    .primaryKey()
    .references(() => weddings.id, { onDelete: "cascade" }),
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
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    question: text("question").notNull(),
    multiple: boolean("multiple").notNull().default(false),
    allowOther: boolean("allow_other").notNull().default(false),
    per: text("per").notNull().default("person"),
    options: jsonb("options").$type<{ id: string; label: string }[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("rsvp_polls_wedding_idx").on(t.weddingId, t.position)],
);

type PollAnswersJson = Record<string, { optionIds: string[]; other: string | null }>;

export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Hash of the personal link's token; the token itself is derived from the id and never stored.
    tokenHash: text("token_hash").notNull().unique(),
    // null = every RSVP event.
    invitedEventIds: jsonb("invited_event_ids").$type<string[] | null>(),
    message: text("message").notNull().default(""),
    pollAnswers: jsonb("poll_answers").$type<PollAnswersJson>().notNull().default({}),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    // "guest" through the personal link, "couple" entered for the household on the guest list.
    answeredBy: text("answered_by").$type<"guest" | "couple">(),
    // v4: a line for the thank-you card and the unsubscribe (which clears every person's email).
    personalLine: text("personal_line").notNull().default(""),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("households_wedding_idx").on(t.weddingId, t.createdAt)],
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
    // Optional address for cards and reminders by email; a household is mailed at every address of its people.
    email: text("email"),
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

// Cards (v4): several versions per wedding and kind, each with a label. The design stays with the wedding;
// deliveries, opens and version choices are guest data and go with the household (retention deletes households).
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weddingId: uuid("wedding_id")
      .notNull()
      .references(() => weddings.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    // Fixed at creation: the engagement version's link (/<wedding>/verlobung/<slug>) survives renaming it.
    slug: text("slug").notNull(),
    position: integer("position").notNull(),
    // The engagement announcement: when the couple first shared its link (copied or by WhatsApp).
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    themeId: text("theme_id").notNull(),
    paletteId: text("palette_id"),
    fontPairingId: text("font_pairing_id"),
    layoutId: text("layout_id"),
    envelope: boolean("envelope").notNull().default(true),
    photoKey: text("photo_key"),
    content: jsonb("content").$type<CardContentJson>().notNull(),
    message: text("message"),
    reminderDays: jsonb("reminder_days").$type<number[]>().notNull().default([]),
    reminderMessage: text("reminder_message"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (t) => [index("cards_wedding_kind_idx").on(t.weddingId, t.kind, t.position), uniqueIndex("cards_wedding_kind_slug_idx").on(t.weddingId, t.kind, t.slug)],
);

type CardContentJson = {
  heading: string;
  names: string;
  text: string;
  place: string;
  eventId: string | null;
  time: string;
  venue: string;
  showReplyBy: boolean;
};

// What happened with one kind of card for one household, whichever version it got: "sent" counts per household
// and kind, so a household never gets two versions of one card. Emails are claimed (email_claimed_at) before they
// are sent, so two instances never send the same one; the same for reminders. reminder_offset is the last
// automatic reminder handled, in days before the reply-by date.
export const cardDeliveries = pgTable(
  "card_deliveries",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    excluded: boolean("excluded").notNull().default(false),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    sharedVia: text("shared_via"),
    emailQueuedAt: timestamp("email_queued_at", { withTimezone: true }),
    emailClaimedAt: timestamp("email_claimed_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    emailError: text("email_error"),
    reminderOffset: integer("reminder_offset"),
    reminderQueuedAt: timestamp("reminder_queued_at", { withTimezone: true }),
    reminderClaimedAt: timestamp("reminder_claimed_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    reminderError: text("reminder_error"),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.kind] })],
);

// The first time a household's page showed a card version (opened status is kept per version).
export const cardOpens = pgTable(
  "card_opens",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.householdId] }), index("card_opens_household_idx").on(t.householdId)],
);

// Which version of an item a household gets. No row: the first version. Deleting a version deletes its rows,
// so its households fall back to the first remaining version.
export const householdVersions = pgTable(
  "household_versions",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    item: text("item").notNull(),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }),
    websiteId: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.item] }), check("household_versions_one_target", sql`num_nonnulls(${t.cardId}, ${t.websiteId}) = 1`)],
);
