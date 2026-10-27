import type { BlockData, BlockType, EventData, SectionTemplate } from "@/domain/sections";
import type { Entitlement, PaidTier, Tier, TierOffer } from "@/domain/billing";
import type { ThemeManifest } from "@/domain/theme";
import type { AnswerSource, Household, HouseholdInput, HouseholdResponse, Poll, PollInput, RequestStatus, RsvpSettings } from "@/domain/guests";
import type { ImportPlan } from "@/domain/guest-import";
import type { CardContent, CardInput, CardKind, CardLabels, CardModel, Delivery, HouseholdCardKind, SharedVia } from "@/domain/cards";
import type { AssignableItem, Assignment } from "@/domain/weddings";
import type { Role } from "@/domain/members";

export type User = { id: string; email: string; firstName: string | null; createdAt: Date };

/** The root of everything a couple makes: names, date, place, and the address of the non-website links. */
export type Wedding = {
  id: string;
  /** Reply-to of the mail guests get: a member, null only until an admin is picked after that person left. */
  contactUserId: string | null;
  /** /<slug>/verlobung, /<slug>/hochzeit.ics; one namespace with the website versions' slugs. */
  slug: string;
  /** The couple's names, e.g. "Anna & Ben". */
  title: string;
  /** Null while the wedding is not planned yet. */
  weddingDate: string | null;
  location: string | null;
  /** The place on the map, both or neither. */
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  lastOpenedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
/** `creatorId` becomes the wedding's first admin and its contact person. */
export type NewWedding = Pick<Wedding, "slug" | "title" | "weddingDate" | "timezone"> & { creatorId: string };
export type WeddingPatch = Partial<Pick<Wedding, "slug" | "title" | "weddingDate" | "location" | "latitude" | "longitude" | "timezone" | "contactUserId">>;

/** A person who may work on a wedding, and as what. */
export type Member = { userId: string; email: string; firstName: string | null; role: Role; createdAt: Date };

/** A pending invitation to become a member of a wedding; the token itself is only in the link. */
export type Invitation = { id: string; weddingId: string; email: string; role: Role; invitedBy: string | null; expiresAt: Date; createdAt: Date };

/** A version of the wedding's website, for an audience. A draft (a 404 publicly) until published. */
export type Website = {
  id: string;
  weddingId: string;
  label: string;
  /** The first version (lowest position) is the one households get by default. */
  position: number;
  slug: string;
  published: boolean;
  welcomeMessage: string;
  hashtag: string;
  showCountdown: boolean;
  coverImageKey: string | null;
  themeId: string;
  paletteId: string | null;
  fontPairingId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewWebsite = Omit<Website, "id" | "createdAt" | "updatedAt">;
export type WebsitePatch = Partial<Omit<Website, "id" | "weddingId" | "createdAt" | "updatedAt">>;

/** A website version with the wedding's names, date, place and time zone: what the site shows. */
export type SiteData = Website & Pick<Wedding, "title" | "weddingDate" | "location" | "timezone">;

/** A section of a website version: a title plus an ordered list of blocks. */
export type Section = {
  id: string;
  position: number;
  title: string;
  visible: boolean;
  /** The block type a template section offers first while it is empty. */
  suggestedType: BlockType | null;
};
export type NewSection = { title: string; visible: boolean; suggestedType: BlockType | null; blocks: BlockData[] };
export type SectionPatch = Partial<Pick<Section, "title" | "visible">>;

export type Block<T extends BlockType = BlockType> = { id: string; sectionId: string; position: number; data: BlockData<T> };

/** An event of the wedding's Ablauf. */
export type WeddingEvent = { id: string; data: EventData };

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(email: string): Promise<User>;
  updateFirstName(id: string, firstName: string): Promise<void>;
  /** Deletes the user and, through the cascades, everything that belongs to them. */
  delete(id: string): Promise<void>;
}

export type MagicLinkRecord = { id: string; email: string; expiresAt: Date; usedAt: Date | null };

export interface MagicLinkRepository {
  create(input: { email: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findByHash(tokenHash: string): Promise<MagicLinkRecord | null>;
  /** Marks the token used; returns false if it was already used (single use, race-safe). */
  markUsed(id: string, at: Date): Promise<boolean>;
  deleteByEmail(email: string): Promise<void>;
}

export type SessionRecord = { id: string; userId: string; expiresAt: Date };

export interface SessionRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findByHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteByHash(tokenHash: string): Promise<void>;
}

export interface RateLimiter {
  /** Records a hit for `key` and returns whether it is within `limit` hits per `windowMs`. */
  hit(key: string, limit: number, windowMs: number, now: Date): Promise<boolean>;
  /** Drops all hits for `key`. */
  forget(key: string): Promise<void>;
}

/** Who uses a slug: weddings and website versions share one namespace. */
export type SlugOwners = { weddingIds: string[]; websites: { id: string; weddingId: string }[] };

export interface WeddingRepository {
  /** Inserts the wedding with its creator as admin and contact person, in one transaction. */
  create(wedding: NewWedding): Promise<Wedding>;
  findById(id: string): Promise<Wedding | null>;
  findBySlug(slug: string): Promise<Wedding | null>;
  /** The weddings the user is a member of, with the user's role in each. */
  listForMember(userId: string): Promise<(Wedding & { role: Role })[]>;
  /** The user's role in the wedding; null for anyone who is not a member (and for ids that are not ids). */
  roleOf(weddingId: string, userId: string): Promise<Role | null>;
  /** Oldest first. */
  listMembers(weddingId: string): Promise<Member[]>;
  /** Does nothing if the user already is a member. */
  addMember(weddingId: string, userId: string, role: Role): Promise<void>;
  setRole(weddingId: string, userId: string, role: Role): Promise<void>;
  removeMember(weddingId: string, userId: string): Promise<void>;
  update(id: string, patch: WeddingPatch): Promise<Wedding>;
  /** Remembers that the couple used the wedding now (wall-clock time, for "most recently used"). */
  markUsed(id: string): Promise<void>;
  /** Deletes the wedding and, through the cascades, everything in it. */
  delete(id: string): Promise<void>;
  slugOwners(slug: string): Promise<SlugOwners>;

  /** The Ablauf: events belong to the wedding; website versions show them through event blocks. Chronological. */
  listEvents(weddingId: string): Promise<WeddingEvent[]>;
  findEvent(weddingId: string, eventId: string): Promise<WeddingEvent | null>;
  addEvent(weddingId: string, data: EventData): Promise<WeddingEvent>;
  updateEvent(eventId: string, data: EventData): Promise<void>;
  /** Deletes the event and, in the same transaction, every event block pointing to it, in any website version. */
  deleteEvent(eventId: string): Promise<void>;
}

export interface InvitationRepository {
  /** Stores the invitation, replacing a pending one for the same wedding and address. */
  replace(input: Omit<Invitation, "id" | "createdAt"> & { tokenHash: string }): Promise<Invitation>;
  findByHash(tokenHash: string): Promise<Invitation | null>;
  /** Not yet expired at `now`, oldest first. */
  listPending(weddingId: string, now: Date): Promise<Invitation[]>;
  /** True if it existed: accepting deletes the invitation, so a token is used at most once. */
  delete(id: string): Promise<boolean>;
}

export interface WebsiteRepository {
  create(website: NewWebsite, sections: NewSection[]): Promise<Website>;
  findById(id: string): Promise<Website | null>;
  findBySlug(slug: string): Promise<Website | null>;
  /** First version first. */
  listByWedding(weddingId: string): Promise<Website[]>;
  update(id: string, patch: WebsitePatch): Promise<Website>;
  delete(id: string): Promise<void>;

  /** By position. */
  listSections(websiteId: string): Promise<Section[]>;
  /** Null for an unknown id, a malformed id or another website's section. */
  findSection(websiteId: string, sectionId: string): Promise<Section | null>;
  /** Appends at the end, with its blocks. */
  addSection(websiteId: string, section: NewSection): Promise<Section>;
  updateSection(sectionId: string, patch: SectionPatch): Promise<void>;
  /** Deletes the section with its blocks. */
  deleteSection(sectionId: string): Promise<void>;
  /** Rewrites positions so that `orderedIds` are 0..n-1. */
  setSectionOrder(websiteId: string, orderedIds: string[]): Promise<void>;

  /** By section position, then block position. */
  listBlocks(websiteId: string): Promise<Block[]>;
  findBlock(websiteId: string, blockId: string): Promise<Block | null>;
  /** Appends at the end of the section. */
  addBlock(websiteId: string, sectionId: string, data: BlockData): Promise<Block>;
  updateBlock(blockId: string, data: BlockData): Promise<void>;
  deleteBlock(blockId: string): Promise<void>;
  /** Rewrites positions within the section so that `orderedIds` are 0..n-1. */
  setBlockOrder(sectionId: string, orderedIds: string[]): Promise<void>;
}

/** Photos belong to the wedding: its website versions and cards share them. */
export interface UploadRepository {
  /** `uploadedBy`: who uploaded it; the photo belongs to the wedding either way. */
  create(input: { key: string; uploadedBy: string; weddingId: string; contentType: string; size: number }): Promise<void>;
  belongsToWedding(key: string, weddingId: string): Promise<boolean>;
  listKeysByWedding(weddingId: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export type StoredFile = { bytes: Uint8Array; contentType: string };

export interface FileStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

export type ProcessedImage = { bytes: Uint8Array; contentType: "image/webp"; extension: "webp" };

export interface ImageProcessor {
  /** Re-encodes the image (dropping EXIF and other metadata) and bounds its size. Throws on non-images. */
  process(bytes: Uint8Array): Promise<ProcessedImage>;
}

export type MailAttachment = { filename: string; content: Uint8Array; contentType: string; /** Set for images shown inline (`cid:` in the HTML). */ cid?: string };

export type MailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  /** Display name for MAIL_FROM's address, e.g. "Anna & Ben über Traureise". The address never changes. */
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
};

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Renders the email that invites someone to work on a wedding. */
export interface InvitationMailTemplate {
  render(mail: { link: string; inviter: string; weddingTitle: string; role: Role; expiresOn: Date }): Omit<MailMessage, "to">;
}

/** Renders the magic-link email in the user's language. */
export interface MagicLinkMailTemplate {
  render(link: string, expiresInMinutes: number): Omit<MailMessage, "to">;
}

export interface ThemeCatalog {
  list(): ThemeManifest[];
  get(id: string): ThemeManifest | undefined;
  defaultThemeId(): string;
  /** A declared SVG asset's markup (card masks and ornaments), or null. */
  readSvg(themeId: string, file: string): string | null;
}

export interface Clock {
  now(): Date;
}

export interface TokenGenerator {
  /** Unguessable, URL-safe token. */
  generate(): string;
  /** One-way hash stored instead of the token. */
  hash(token: string): string;
}

/** `purchasedBy`: the member who bought it; null once that account is gone (or if unknown). */
export type EntitlementRecord = Entitlement & { id: string; weddingId: string; provider: string; purchasedBy: string | null; createdAt: Date };

export type BillingChange =
  | { kind: "grant"; weddingId: string; tier: PaidTier; purchaseRef: string; provider: string; validUntil: Date; purchasedBy: string | null }
  | { kind: "revoke"; purchaseRef: string; at: Date }
  | { kind: "none" };

export interface BillingRepository {
  /**
   * Records the provider event id and applies the change in one transaction, at most once per event.
   * A purchase reference is granted at most once, so a replayed payment never undoes a refund.
   */
  applyEvent(eventId: string, change: BillingChange): Promise<"applied" | "duplicate">;
  listByWedding(weddingId: string): Promise<EntitlementRecord[]>;
  /** The packages of every wedding where the user is an admin. */
  listForAdmin(userId: string): Promise<EntitlementRecord[]>;
}

export type PaymentEvent =
  | { type: "paid"; eventId: string; purchaseRef: string; productId: string; weddingId: string | null }
  | { type: "revoked"; eventId: string; purchaseRef: string | null }
  | { type: "ignored"; eventId: string };

/** `priceCents` is set only for an upgrade: the product's price minus what the wedding already paid. */
export type CheckoutRequest = {
  productId: string;
  weddingId: string;
  tier: PaidTier;
  customerEmail: string;
  successUrl: string;
  requestId: string;
  priceCents?: number;
};

export interface PaymentProvider {
  /** Identifies the provider on stored purchases, e.g. "Creem". */
  readonly name: string;
  /** Returns the hosted checkout page the buyer is sent to. */
  createCheckout(request: CheckoutRequest): Promise<{ url: string }>;
  /** Verifies the signature of a webhook (raw body) and parses it; null if the signature is invalid. */
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent | null;
}

export type BillingSettings = { enabled: boolean; offers: TierOffer[]; unlockedTiers: Tier[] };

export type ArchiveEntry = { path: string; bytes: Uint8Array };

export interface ArchiveWriter {
  zip(entries: ArchiveEntry[]): Promise<Uint8Array>;
}

export type SheetRead = { ok: true; rows: string[][] } | { ok: false; error: "unreadable" | "too_large" };

export interface SpreadsheetCodec {
  /** XLSX by zip signature (PK\x03\x04), CSV otherwise. Cells come back trimmed; trailing empty rows are dropped. */
  read(bytes: Uint8Array): SheetRead;
  /** One sheet, every cell a string cell (t="inlineStr"). */
  writeXlsx(rows: string[][]): Uint8Array;
}

export type GuestImportBatch = Pick<ImportPlan, "create" | "join" | "overwrite">;

export type PollRecord = Poll & { position: number };
export type NewPoll = Omit<PollInput, "options"> & { options: Poll["options"] };
export type HouseholdData = Omit<HouseholdInput, "people"> & { people: { id: string | null; name: string; isChild: boolean; email: string | null }[] };

/** Guest lists. Everything hangs off the wedding (ON DELETE CASCADE). */
export interface GuestRepository {
  getSettings(weddingId: string): Promise<RsvpSettings>;
  saveSettings(weddingId: string, settings: RsvpSettings): Promise<void>;
  listPolls(weddingId: string): Promise<PollRecord[]>;
  createPoll(weddingId: string, poll: NewPoll): Promise<PollRecord>;
  /** Returns false if the poll does not belong to the wedding. */
  updatePoll(weddingId: string, pollId: string, poll: NewPoll): Promise<boolean>;
  deletePoll(weddingId: string, pollId: string): Promise<void>;

  /** Households with their people and requests, oldest first. */
  listHouseholds(weddingId: string): Promise<Household[]>;
  findHousehold(weddingId: string, householdId: string): Promise<Household | null>;
  findByTokenHash(tokenHash: string): Promise<{ weddingId: string; household: Household } | null>;
  /** `tokenHashFor` turns the new household's id into the hash of its personal link. */
  createHousehold(weddingId: string, data: HouseholdData, tokenHashFor: (householdId: string) => string): Promise<Household>;
  /** One transaction. Overwrites and joins are limited to the wedding's own households; anything else rolls everything back. */
  importGuests(weddingId: string, batch: GuestImportBatch, tokenHashFor: (householdId: string) => string): Promise<void>;
  /** People with an id are updated, people without one added, people left out removed. */
  updateHousehold(weddingId: string, householdId: string, data: HouseholdData): Promise<void>;
  deleteHousehold(weddingId: string, householdId: string): Promise<void>;
  /** Stores a household's answer and its new requests in one transaction. */
  /** `by`: the household through its link, or the couple for it. */
  saveResponse(householdId: string, response: HouseholdResponse, at: Date, by: AnswerSource): Promise<void>;
  /** Adding puts the requested person into the household. Returns false for unknown or decided requests. */
  decideRequest(weddingId: string, requestId: string, status: Exclude<RequestStatus, "pending">, at: Date): Promise<boolean>;

  /** Which version of each item households get (no entry: the first version). */
  listAssignments(weddingId: string): Promise<Assignment[]>;
  /** The version must belong to the household's wedding and fit the item; the use case checks both. */
  assign(householdId: string, item: AssignableItem, target: { cardId: string } | { websiteId: string }): Promise<void>;

  /** Clears every person's email address in the household (one-click unsubscribe); false for unknown households. */
  unsubscribe(householdId: string, at: Date): Promise<boolean>;
  /** Retention: removes households, people, answers and requests of a wedding; returns how many households. */
  deleteGuestData(weddingId: string): Promise<number>;
  listWeddingIdsWithGuests(): Promise<string[]>;
  listWeddingIdsWithDailySummary(): Promise<string[]>;
  lastSummaryAt(weddingId: string): Promise<Date | null>;
  /** Compare-and-set, so only one instance sends a summary. */
  claimDailySummary(weddingId: string, previous: Date | null, at: Date): Promise<boolean>;
  /** True once per deletion date, so only one instance warns, and only once. */
  claimRetentionWarning(weddingId: string, deleteAt: Date): Promise<boolean>;
}

/** Personal links: a token derived from the household id with a server secret. Only its hash is stored. */
export interface GuestLinks {
  tokenFor(householdId: string): string;
  hash(token: string): string;
  /** Unsubscribe links: the household id with a signature, so they work without login and without a stored token. */
  unsubscribeTokenFor(householdId: string): string;
  /** The household id of a valid unsubscribe token, or null. */
  verifyUnsubscribe(token: string): string | null;
}

export type AnswerMail = { websiteTitle: string; household: string; coming: string[]; notComing: string[]; message: string; requests: string[]; guestsUrl: string };
export type SummaryMail = { websiteTitle: string; households: { name: string; coming: number; notComing: number }[]; totals: { coming: number; notComing: number; open: number }; guestsUrl: string };
export type RetentionMail = { websiteTitle: string; deleteOn: Date; guestsUrl: string };

/** Emails to the couple about their guests. */
export interface GuestMailTemplates {
  answer(mail: AnswerMail): Omit<MailMessage, "to">;
  dailySummary(mail: SummaryMail): Omit<MailMessage, "to">;
  retentionWarning(mail: RetentionMail): Omit<MailMessage, "to">;
}

// ---- cards (v4) ----

export type Card = {
  id: string;
  weddingId: string;
  kind: CardKind;
  /** The version's name ("Standard", "Familie"); several versions per kind for different audiences. */
  label: string;
  /** Fixed at creation; the engagement version's link. */
  slug: string;
  /** The first version (lowest position) is the one households get by default. */
  position: number;
  /** Engagement announcement: when the couple first shared its link. */
  sharedAt: Date | null;
  themeId: string;
  paletteId: string | null;
  fontPairingId: string | null;
  layoutId: string | null;
  envelope: boolean;
  photoKey: string | null;
  content: CardContent;
  /** WhatsApp text and email introduction; null uses the default. */
  message: string | null;
  /** Invitation: automatic email reminders, in days before the reply-by date. */
  reminderDays: number[];
  reminderMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};
export type NewCard = Omit<Card, "id" | "sharedAt" | "createdAt" | "updatedAt">;

/** What happened with one kind of card for one household, whichever version it got. */
export type DeliveryRecord = Omit<Delivery, "openedAt"> & { householdId: string; kind: HouseholdCardKind };
export type OpenRecord = { cardId: string; householdId: string; openedAt: Date };
export type MailChannel = "card" | "reminder";
export type QueuedMail = { householdId: string; kind: HouseholdCardKind; weddingId: string; channel: MailChannel };

/** Cards and their deliveries. Cards hang off the wedding; deliveries, opens off the household (cascades). */
export interface CardRepository {
  create(card: NewCard): Promise<Card>;
  findById(cardId: string): Promise<Card | null>;
  listByWedding(weddingId: string): Promise<Card[]>;
  update(cardId: string, input: CardInput): Promise<void>;
  rename(cardId: string, label: string): Promise<void>;
  delete(cardId: string): Promise<void>;
  /** Keeps the first time. */
  markLinkShared(cardId: string, at: Date): Promise<void>;

  listDeliveries(weddingId: string): Promise<DeliveryRecord[]>;
  listDeliveriesOfHousehold(householdId: string): Promise<DeliveryRecord[]>;
  setExcluded(householdId: string, kind: HouseholdCardKind, excluded: boolean): Promise<void>;
  /** Records the first share; later shares keep the first time and channel. */
  markShared(householdId: string, kind: HouseholdCardKind, via: SharedVia, at: Date): Promise<void>;
  /** Undoes a share marked by hand ("manual"); returns false if there was none. */
  unmarkShared(householdId: string, kind: HouseholdCardKind): Promise<boolean>;

  listOpens(weddingId: string): Promise<OpenRecord[]>;
  listOpensOfHousehold(householdId: string): Promise<OpenRecord[]>;
  /** Only the first visit counts; returns whether this one did. */
  markOpened(cardId: string, householdId: string, at: Date): Promise<boolean>;

  /** Queues an email per household, unless one is being sent right now; returns how many were queued. */
  queueMail(channel: MailChannel, kind: HouseholdCardKind, householdIds: string[], at: Date): Promise<number>;
  listQueuedMail(limit: number, weddingId?: string): Promise<QueuedMail[]>;
  /** Compare-and-set: true for exactly one caller, so an email is never sent twice. */
  claimMail(channel: MailChannel, householdId: string, kind: HouseholdCardKind, at: Date): Promise<boolean>;
  finishMail(channel: MailChannel, householdId: string, kind: HouseholdCardKind, outcome: { sentAt: Date } | { error: string }): Promise<void>;
  /** Claims older than `before` that never finished (a crash mid-send) become failures, never retries. */
  failStaleClaims(before: Date): Promise<number>;
  /** Compare-and-set on the last automatic reminder's offset (the invitation). */
  claimAutomaticReminder(householdId: string, offset: number, at: Date): Promise<boolean>;
  /** Weddings with an invitation version that has automatic reminders. */
  listWeddingIdsWithReminders(): Promise<string[]>;
}

export type PaperFormat = "a6" | "a5";

/** Draws a card as an image or a printable PDF, on the instance. `photo` is the stored photo, if any. */
export interface CardRenderer {
  png(model: CardModel, photo: Uint8Array | null, width: number): Promise<Uint8Array>;
  pdf(model: CardModel, photo: Uint8Array | null, format: PaperFormat): Promise<Uint8Array>;
}

/** Translated texts for websites: the standard template's section titles and a new section's title. */
export type SiteTexts = { sectionTitles: Record<SectionTemplate, string>; newSectionTitle: string };

/** Translated texts for cards (labels on the card, defaults for new cards). */
export type CardTexts = {
  labels: CardLabels;
  defaults: Record<CardKind, { heading: string; text: string; message: string }>;
  reminderMessage: string;
  sampleHousehold: string;
  /** "{couple}" is replaced. */
  calendarTitle: string;
  /** The name of every item's first version ("Standard"). */
  firstVersionLabel: string;
};

export type CardMail = {
  kind: CardKind;
  couple: string;
  household: string;
  message: string;
  pageUrl: string;
  unsubscribeUrl: string;
  /** Content id of the attached card image. */
  imageCid: string;
};
export type ReminderMail = Omit<CardMail, "kind" | "imageCid"> & { replyBy: Date | null };

/** Emails to guests on the couple's behalf. */
export interface CardMailTemplates {
  card(mail: CardMail): Omit<MailMessage, "to">;
  reminder(mail: ReminderMail): Omit<MailMessage, "to">;
}
