import type { CollectionKind, ItemData, SectionKind } from "@/domain/sections";
import type { Entitlement, PaidTier, Tier, TierOffer } from "@/domain/billing";
import type { ThemeManifest } from "@/domain/theme";
import type { Household, HouseholdInput, HouseholdResponse, Poll, PollInput, RequestStatus, RsvpSettings } from "@/domain/guests";
import type { CardContent, CardInput, CardKind, CardLabels, CardModel, Delivery, SharedVia } from "@/domain/cards";

export type User = { id: string; email: string; firstName: string | null; createdAt: Date };

export type Website = {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  weddingDate: string | null;
  location: string | null;
  welcomeMessage: string;
  hashtag: string;
  showCountdown: boolean;
  coverImageKey: string | null;
  timezone: string;
  themeId: string;
  /** False while the couple only has cards: the public website is not created yet (/<slug> is a 404). */
  siteEnabled: boolean;
  paletteId: string | null;
  fontPairingId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewWebsite = Pick<Website, "ownerId" | "slug" | "title" | "weddingDate" | "themeId" | "timezone"> & { siteEnabled?: boolean };
export type WebsitePatch = Partial<Omit<Website, "id" | "ownerId" | "createdAt" | "updatedAt">>;

export type Section = { kind: SectionKind; title: string | null; visible: boolean; body: string };
export type SectionPatch = Partial<Omit<Section, "kind">>;

export type Item<K extends CollectionKind = CollectionKind> = {
  id: string;
  kind: K;
  position: number;
  data: ItemData<K>;
};

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

export interface WebsiteRepository {
  create(website: NewWebsite, sections: Section[]): Promise<Website>;
  findById(id: string): Promise<Website | null>;
  findBySlug(slug: string): Promise<Website | null>;
  listByOwner(ownerId: string): Promise<Website[]>;
  slugTaken(slug: string, exceptWebsiteId?: string): Promise<boolean>;
  update(id: string, patch: WebsitePatch): Promise<Website>;
  delete(id: string): Promise<void>;
  listSections(websiteId: string): Promise<Section[]>;
  updateSection(websiteId: string, kind: SectionKind, patch: SectionPatch): Promise<void>;
  listItems(websiteId: string): Promise<Item[]>;
  findItem(websiteId: string, itemId: string): Promise<Item | null>;
  /** Appends at the end of the section. */
  addItem<K extends CollectionKind>(websiteId: string, kind: K, data: ItemData<K>): Promise<Item<K>>;
  updateItem<K extends CollectionKind>(itemId: string, data: ItemData<K>): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  /** Rewrites positions so that `orderedIds` are 0..n-1. */
  setItemOrder(websiteId: string, kind: CollectionKind, orderedIds: string[]): Promise<void>;
}

export type UploadRecord = { key: string; websiteId: string | null; contentType: string; size: number; createdAt: Date };

export interface UploadRepository {
  create(input: { key: string; ownerId: string; websiteId: string; contentType: string; size: number }): Promise<void>;
  belongsToWebsite(key: string, websiteId: string): Promise<boolean>;
  listKeysByWebsite(websiteId: string): Promise<string[]>;
  listByOwner(ownerId: string): Promise<UploadRecord[]>;
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
  to: string;
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

export type EntitlementRecord = Entitlement & { id: string; websiteId: string; provider: string; createdAt: Date };

export type BillingChange =
  | { kind: "grant"; websiteId: string; tier: PaidTier; purchaseRef: string; provider: string; validUntil: Date }
  | { kind: "revoke"; purchaseRef: string; at: Date }
  | { kind: "none" };

export interface BillingRepository {
  /**
   * Records the provider event id and applies the change in one transaction, at most once per event.
   * A purchase reference is granted at most once, so a replayed payment never undoes a refund.
   */
  applyEvent(eventId: string, change: BillingChange): Promise<"applied" | "duplicate">;
  listByWebsite(websiteId: string): Promise<EntitlementRecord[]>;
  listByOwner(ownerId: string): Promise<EntitlementRecord[]>;
}

export type PaymentEvent =
  | { type: "paid"; eventId: string; purchaseRef: string; productId: string; websiteId: string | null }
  | { type: "revoked"; eventId: string; purchaseRef: string | null }
  | { type: "ignored"; eventId: string };

export type CheckoutRequest = { productId: string; websiteId: string; tier: PaidTier; customerEmail: string; successUrl: string; requestId: string };

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

export type PollRecord = Poll & { position: number };
export type NewPoll = Omit<PollInput, "options"> & { options: Poll["options"] };
export type HouseholdData = Omit<HouseholdInput, "people"> & { people: { id: string | null; name: string; isChild: boolean }[] };

/** Guest lists. Everything hangs off the website (ON DELETE CASCADE). */
export interface GuestRepository {
  getSettings(websiteId: string): Promise<RsvpSettings>;
  saveSettings(websiteId: string, settings: RsvpSettings): Promise<void>;
  listPolls(websiteId: string): Promise<PollRecord[]>;
  createPoll(websiteId: string, poll: NewPoll): Promise<PollRecord>;
  /** Returns false if the poll does not belong to the website. */
  updatePoll(websiteId: string, pollId: string, poll: NewPoll): Promise<boolean>;
  deletePoll(websiteId: string, pollId: string): Promise<void>;

  /** Households with their people and requests, oldest first. */
  listHouseholds(websiteId: string): Promise<Household[]>;
  findHousehold(websiteId: string, householdId: string): Promise<Household | null>;
  findByTokenHash(tokenHash: string): Promise<{ websiteId: string; household: Household } | null>;
  /** `tokenHashFor` turns the new household's id into the hash of its personal link. */
  createHousehold(websiteId: string, data: HouseholdData, tokenHashFor: (householdId: string) => string): Promise<Household>;
  /** People with an id are updated, people without one added, people left out removed. */
  updateHousehold(websiteId: string, householdId: string, data: HouseholdData): Promise<void>;
  deleteHousehold(websiteId: string, householdId: string): Promise<void>;
  /** Stores a household's answer and its new requests in one transaction. */
  saveResponse(householdId: string, response: HouseholdResponse, at: Date): Promise<void>;
  /** Adding puts the requested person into the household. Returns false for unknown or decided requests. */
  decideRequest(websiteId: string, requestId: string, status: Exclude<RequestStatus, "pending">, at: Date): Promise<boolean>;

  /** Clears the household's email address (one-click unsubscribe); false for unknown households. */
  unsubscribe(householdId: string, at: Date): Promise<boolean>;
  /** Retention: removes households, people, answers and requests of a website; returns how many households. */
  deleteGuestData(websiteId: string): Promise<number>;
  listWebsiteIdsWithGuests(): Promise<string[]>;
  listWebsiteIdsWithDailySummary(): Promise<string[]>;
  lastSummaryAt(websiteId: string): Promise<Date | null>;
  /** Compare-and-set, so only one instance sends a summary. */
  claimDailySummary(websiteId: string, previous: Date | null, at: Date): Promise<boolean>;
  /** True once per deletion date, so only one instance warns, and only once. */
  claimRetentionWarning(websiteId: string, deleteAt: Date): Promise<boolean>;
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
  websiteId: string;
  kind: CardKind;
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
export type NewCard = Omit<Card, "id" | "createdAt" | "updatedAt">;

export type DeliveryRecord = Delivery & { cardId: string; householdId: string };
export type MailChannel = "card" | "reminder";
export type QueuedMail = { cardId: string; householdId: string; websiteId: string; channel: MailChannel };

/** Cards and their deliveries. Cards hang off the website, deliveries off the card and the household (cascades). */
export interface CardRepository {
  /** Null when the website already has a card of this kind. */
  create(card: NewCard): Promise<Card | null>;
  find(websiteId: string, kind: CardKind): Promise<Card | null>;
  listByWebsite(websiteId: string): Promise<Card[]>;
  update(websiteId: string, kind: CardKind, input: CardInput): Promise<void>;
  delete(websiteId: string, kind: CardKind): Promise<void>;

  listDeliveries(cardId: string): Promise<DeliveryRecord[]>;
  listDeliveriesOfHousehold(householdId: string): Promise<DeliveryRecord[]>;
  setExcluded(cardId: string, householdId: string, excluded: boolean): Promise<void>;
  /** Records the first share; later shares keep the first time and channel. */
  markShared(cardId: string, householdId: string, via: SharedVia, at: Date): Promise<void>;
  /** Only the first visit counts; returns whether this one did. */
  markOpened(cardId: string, householdId: string, at: Date): Promise<boolean>;

  /** Queues an email per household, unless one is being sent right now; returns how many were queued. */
  queueMail(channel: MailChannel, cardId: string, householdIds: string[], at: Date): Promise<number>;
  listQueuedMail(limit: number, websiteId?: string): Promise<QueuedMail[]>;
  /** Compare-and-set: true for exactly one caller, so an email is never sent twice. */
  claimMail(channel: MailChannel, cardId: string, householdId: string, at: Date): Promise<boolean>;
  finishMail(channel: MailChannel, cardId: string, householdId: string, outcome: { sentAt: Date } | { error: string }): Promise<void>;
  /** Claims older than `before` that never finished (a crash mid-send) become failures, never retries. */
  failStaleClaims(before: Date): Promise<number>;
  /** Compare-and-set on the last automatic reminder's offset. */
  claimAutomaticReminder(cardId: string, householdId: string, offset: number, at: Date): Promise<boolean>;
  /** Invitations with automatic reminders configured. */
  listInvitationsWithReminders(): Promise<{ websiteId: string; cardId: string }[]>;
}

export type PaperFormat = "a6" | "a5";

/** Draws a card as an image or a printable PDF, on the instance. `photo` is the stored photo, if any. */
export interface CardRenderer {
  png(model: CardModel, photo: Uint8Array | null, width: number): Promise<Uint8Array>;
  pdf(model: CardModel, photo: Uint8Array | null, format: PaperFormat): Promise<Uint8Array>;
}

/** Translated texts for cards (labels on the card, defaults for new cards). */
export type CardTexts = {
  labels: CardLabels;
  defaults: Record<CardKind, { heading: string; text: string; message: string }>;
  reminderMessage: string;
  sampleHousehold: string;
  /** "{couple}" is replaced. */
  calendarTitle: string;
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
