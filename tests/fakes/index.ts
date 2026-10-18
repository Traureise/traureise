import { createHash, randomUUID } from "node:crypto";
import type {
  Card,
  CardMailTemplates,
  CardRenderer,
  CardRepository,
  CardTexts,
  DeliveryRecord,
  MailChannel,
  NewCard,
  QueuedMail,
  ArchiveEntry,
  ArchiveWriter,
  BillingChange,
  BillingRepository,
  CheckoutRequest,
  EntitlementRecord,
  PaymentEvent,
  PaymentProvider,
  Clock,
  FileStorage,
  GuestLinks,
  GuestMailTemplates,
  GuestRepository,
  HouseholdData,
  ImageProcessor,
  NewPoll,
  PollRecord,
  Item,
  MagicLinkMailTemplate,
  MagicLinkRecord,
  MagicLinkRepository,
  MailMessage,
  Mailer,
  RateLimiter,
  Section,
  SessionRecord,
  SessionRepository,
  StoredFile,
  ThemeCatalog,
  TokenGenerator,
  UploadRepository,
  User,
  UserRepository,
  Website,
  WebsiteRepository,
} from "@/application/ports";
import type { Deps } from "@/application/deps";
import type { CollectionKind } from "@/domain/sections";
import { DEFAULT_RSVP_SETTINGS, type Household, type HouseholdResponse, type RsvpSettings } from "@/domain/guests";
import { parseThemeManifest, type ThemeManifest } from "@/domain/theme";
import type { CardInput, CardKind, Delivery, SharedVia } from "@/domain/cards";

export class FakeClock implements Clock {
  constructor(public current = new Date("2026-10-18T10:00:00Z")) {}
  now() {
    return new Date(this.current);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class FakeTokens implements TokenGenerator {
  private n = 0;
  generate() {
    return `token-${++this.n}`;
  }
  hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}

export class InMemoryUsers implements UserRepository {
  users: User[] = [];
  /** Stands in for ON DELETE CASCADE across the other in-memory repositories. */
  cascades: ((userId: string) => void)[] = [];
  async findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async create(email: string) {
    const user = { id: randomUUID(), email, firstName: null, createdAt: new Date() };
    this.users.push(user);
    return user;
  }
  async updateFirstName(id: string, firstName: string) {
    const user = this.users.find((u) => u.id === id);
    if (user) user.firstName = firstName;
  }
  async delete(id: string) {
    this.users = this.users.filter((u) => u.id !== id);
    for (const cascade of this.cascades) cascade(id);
  }
}

export class InMemoryMagicLinks implements MagicLinkRepository {
  links: (MagicLinkRecord & { tokenHash: string })[] = [];
  async create(input: { email: string; tokenHash: string; expiresAt: Date }) {
    this.links.push({ id: randomUUID(), usedAt: null, ...input });
  }
  async findByHash(tokenHash: string) {
    return this.links.find((l) => l.tokenHash === tokenHash) ?? null;
  }
  async markUsed(id: string, at: Date) {
    const link = this.links.find((l) => l.id === id);
    if (!link || link.usedAt) return false;
    link.usedAt = at;
    return true;
  }
  async deleteByEmail(email: string) {
    this.links = this.links.filter((l) => l.email !== email);
  }
}

export class InMemorySessions implements SessionRepository {
  sessions: (SessionRecord & { tokenHash: string })[] = [];
  async create(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    this.sessions.push({ id: randomUUID(), ...input });
  }
  async findByHash(tokenHash: string) {
    return this.sessions.find((s) => s.tokenHash === tokenHash) ?? null;
  }
  async deleteByHash(tokenHash: string) {
    this.sessions = this.sessions.filter((s) => s.tokenHash !== tokenHash);
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  hits: { key: string; at: Date }[] = [];
  async hit(key: string, limit: number, windowMs: number, now: Date) {
    this.hits.push({ key, at: now });
    const recent = this.hits.filter((h) => h.key === key && now.getTime() - h.at.getTime() < windowMs);
    return recent.length <= limit;
  }
  async forget(key: string) {
    this.hits = this.hits.filter((h) => h.key !== key);
  }
}

/** Repositories hand out snapshots, like a database would. */
const copy = <T>(value: T): T => structuredClone(value);
function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const rest = { ...value };
  delete rest[key];
  return rest;
}

export class InMemoryWebsites implements WebsiteRepository {
  websites: Website[] = [];
  sections = new Map<string, Section[]>();
  items: (Item & { websiteId: string })[] = [];
  /** Stands in for ON DELETE CASCADE from websites. */
  cascades: ((websiteId: string) => void)[] = [];

  async create(input: Parameters<WebsiteRepository["create"]>[0], sections: Section[]) {
    const now = new Date();
    const website: Website = {
      id: randomUUID(),
      location: null,
      welcomeMessage: "",
      hashtag: "",
      showCountdown: false,
      coverImageKey: null,
      paletteId: null,
      fontPairingId: null,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    this.websites.push(website);
    this.sections.set(website.id, sections.map((s) => ({ ...s })));
    return website;
  }
  async findById(id: string) {
    return copy(this.websites.find((w) => w.id === id) ?? null);
  }
  async findBySlug(slug: string) {
    return copy(this.websites.find((w) => w.slug === slug) ?? null);
  }
  async listByOwner(ownerId: string) {
    return copy(this.websites.filter((w) => w.ownerId === ownerId));
  }
  async slugTaken(slug: string, exceptWebsiteId?: string) {
    return this.websites.some((w) => w.slug === slug && w.id !== exceptWebsiteId);
  }
  async update(id: string, patch: Partial<Website>) {
    const website = this.websites.find((w) => w.id === id)!;
    Object.assign(website, patch, { updatedAt: new Date() });
    return copy(website);
  }
  async delete(id: string) {
    this.websites = this.websites.filter((w) => w.id !== id);
    this.sections.delete(id);
    this.items = this.items.filter((i) => i.websiteId !== id);
    for (const cascade of this.cascades) cascade(id);
  }
  async listSections(websiteId: string) {
    return copy(this.sections.get(websiteId) ?? []);
  }
  async updateSection(websiteId: string, kind: Section["kind"], patch: Partial<Section>) {
    const section = this.sections.get(websiteId)!.find((s) => s.kind === kind)!;
    Object.assign(section, patch);
  }
  async listItems(websiteId: string) {
    return copy(this.items.filter((i) => i.websiteId === websiteId).sort((a, b) => a.position - b.position));
  }
  async findItem(websiteId: string, itemId: string) {
    return copy(this.items.find((i) => i.websiteId === websiteId && i.id === itemId) ?? null);
  }
  async addItem<K extends CollectionKind>(websiteId: string, kind: K, data: Item<K>["data"]) {
    const position = Math.max(-1, ...this.items.filter((i) => i.websiteId === websiteId && i.kind === kind).map((i) => i.position)) + 1;
    const item = { id: randomUUID(), websiteId, kind, position, data } as Item<K> & { websiteId: string };
    this.items.push(item as never);
    return item;
  }
  async updateItem(itemId: string, data: Item["data"]) {
    this.items.find((i) => i.id === itemId)!.data = data;
  }
  async deleteItem(itemId: string) {
    this.items = this.items.filter((i) => i.id !== itemId);
  }
  async setItemOrder(websiteId: string, kind: CollectionKind, orderedIds: string[]) {
    orderedIds.forEach((id, position) => {
      const item = this.items.find((i) => i.id === id && i.websiteId === websiteId && i.kind === kind);
      if (item) item.position = position;
    });
  }
}

export class InMemoryUploads implements UploadRepository {
  uploads: { key: string; ownerId: string; websiteId: string; contentType: string; size: number; createdAt: Date }[] = [];
  async create(input: Omit<InMemoryUploads["uploads"][number], "createdAt">) {
    this.uploads.push({ ...input, createdAt: new Date() });
  }
  async listByOwner(ownerId: string) {
    return this.uploads
      .filter((u) => u.ownerId === ownerId)
      .map((u) => ({ key: u.key, websiteId: u.websiteId, contentType: u.contentType, size: u.size, createdAt: u.createdAt }));
  }
  async belongsToWebsite(key: string, websiteId: string) {
    return this.uploads.some((u) => u.key === key && u.websiteId === websiteId);
  }
  async listKeysByWebsite(websiteId: string) {
    return this.uploads.filter((u) => u.websiteId === websiteId).map((u) => u.key);
  }
  async delete(key: string) {
    this.uploads = this.uploads.filter((u) => u.key !== key);
  }
}

export class InMemoryStorage implements FileStorage {
  files = new Map<string, StoredFile>();
  async put(key: string, bytes: Uint8Array, contentType: string) {
    this.files.set(key, { bytes, contentType });
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

export class FakeImageProcessor implements ImageProcessor {
  async process(bytes: Uint8Array) {
    if (bytes[0] !== 0xff && bytes[0] !== 0x89) throw new Error("not an image");
    return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" as const, extension: "webp" as const };
  }
}

export class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}

export class InMemoryBilling implements BillingRepository {
  entitlements: EntitlementRecord[] = [];
  events = new Set<string>();
  constructor(private websites: InMemoryWebsites) {}
  async applyEvent(eventId: string, change: BillingChange) {
    if (this.events.has(eventId)) return "duplicate" as const;
    this.events.add(eventId);
    if (change.kind === "grant" && !this.entitlements.some((e) => e.purchaseRef === change.purchaseRef)) {
      const { websiteId, tier, purchaseRef, provider, validUntil } = change;
      this.entitlements.push({ id: randomUUID(), revokedAt: null, createdAt: new Date(), websiteId, tier, purchaseRef, provider, validUntil });
    }
    if (change.kind === "revoke") {
      for (const e of this.entitlements) if (e.purchaseRef === change.purchaseRef && !e.revokedAt) e.revokedAt = change.at;
    }
    return "applied" as const;
  }
  async listByWebsite(websiteId: string) {
    return copy(this.entitlements.filter((e) => e.websiteId === websiteId));
  }
  async listByOwner(ownerId: string) {
    const ids = new Set(this.websites.websites.filter((w) => w.ownerId === ownerId).map((w) => w.id));
    return copy(this.entitlements.filter((e) => ids.has(e.websiteId)));
  }
}

export class FakePayments implements PaymentProvider {
  readonly name = "Testpay";
  checkouts: CheckoutRequest[] = [];
  /** Webhooks are "signed" with this value; the body is the PaymentEvent as JSON. */
  static SIGNATURE = "valid";
  async createCheckout(request: CheckoutRequest) {
    this.checkouts.push(request);
    return { url: `https://pay.example.org/checkout/${request.requestId}` };
  }
  parseWebhook(rawBody: string, signature: string | null): PaymentEvent | null {
    return signature === FakePayments.SIGNATURE ? (JSON.parse(rawBody) as PaymentEvent) : null;
  }
}

export class FakeArchive implements ArchiveWriter {
  async zip(entries: ArchiveEntry[]) {
    return new TextEncoder().encode(JSON.stringify(entries.map((e) => ({ path: e.path, bytes: [...e.bytes] }))));
  }
  static read(bytes: Uint8Array): ArchiveEntry[] {
    return (JSON.parse(new TextDecoder().decode(bytes)) as { path: string; bytes: number[] }[]).map((e) => ({ path: e.path, bytes: new Uint8Array(e.bytes) }));
  }
}

export class InMemoryGuests implements GuestRepository {
  settings = new Map<string, RsvpSettings & { lastSummaryAt: Date | null; warnedFor: Date | null }>();
  polls: (PollRecord & { websiteId: string })[] = [];
  households: (Household & { websiteId: string; tokenHash: string })[] = [];
  private n = 0;
  private id = (prefix: string) => `${prefix}-${++this.n}`;

  private state(websiteId: string) {
    if (!this.settings.has(websiteId)) this.settings.set(websiteId, { ...DEFAULT_RSVP_SETTINGS, lastSummaryAt: null, warnedFor: null });
    return this.settings.get(websiteId)!;
  }
  async getSettings(websiteId: string) {
    const { replyBy, eventIds, meal, notify, whatsappMessage } = this.state(websiteId);
    return copy({ replyBy, eventIds, meal, notify, whatsappMessage });
  }
  async saveSettings(websiteId: string, settings: RsvpSettings) {
    Object.assign(this.state(websiteId), copy(settings));
  }
  async listPolls(websiteId: string) {
    return copy(this.polls.filter((p) => p.websiteId === websiteId)).map((p) => omit(p, "websiteId"));
  }
  async createPoll(websiteId: string, poll: NewPoll) {
    const record = { ...copy(poll), id: this.id("poll"), position: this.polls.length, websiteId };
    this.polls.push(record);
    return omit(copy(record), "websiteId");
  }
  async updatePoll(websiteId: string, pollId: string, poll: NewPoll) {
    const record = this.polls.find((p) => p.id === pollId && p.websiteId === websiteId);
    if (!record) return false;
    Object.assign(record, copy(poll));
    return true;
  }
  async deletePoll(websiteId: string, pollId: string) {
    this.polls = this.polls.filter((p) => !(p.id === pollId && p.websiteId === websiteId));
  }
  private strip = (h: InMemoryGuests["households"][number]): Household => omit(omit(copy(h), "websiteId"), "tokenHash");
  async listHouseholds(websiteId: string) {
    return this.households.filter((h) => h.websiteId === websiteId).map(this.strip);
  }
  async findHousehold(websiteId: string, householdId: string) {
    const h = this.households.find((x) => x.id === householdId && x.websiteId === websiteId);
    return h ? this.strip(h) : null;
  }
  async findByTokenHash(tokenHash: string) {
    const h = this.households.find((x) => x.tokenHash === tokenHash);
    return h ? { websiteId: h.websiteId, household: this.strip(h) } : null;
  }
  private person = (p: HouseholdData["people"][number]) => ({
    id: p.id ?? this.id("guest"),
    name: p.name,
    isChild: p.isChild,
    attending: null,
    eventIds: [],
    mealOptionId: null,
    allergies: "",
    pollAnswers: {},
    fromRequest: false,
  });
  async createHousehold(websiteId: string, data: HouseholdData, tokenHashFor: (id: string) => string) {
    const id = this.id("household");
    const household = {
      id,
      websiteId,
      tokenHash: tokenHashFor(id),
      name: data.name,
      invitedEventIds: data.invitedEventIds,
      message: "",
      pollAnswers: {},
      respondedAt: null,
      createdAt: new Date(),
      email: data.email,
      personalLine: data.personalLine,
      unsubscribedAt: null,
      people: data.people.map((p) => this.person({ ...p, id: null })),
      requests: [],
    };
    this.households.push(household);
    return this.strip(household);
  }
  async updateHousehold(websiteId: string, householdId: string, data: HouseholdData) {
    const h = this.households.find((x) => x.id === householdId && x.websiteId === websiteId)!;
    h.name = data.name;
    h.invitedEventIds = data.invitedEventIds;
    if (data.email !== h.email) h.unsubscribedAt = null;
    h.email = data.email;
    h.personalLine = data.personalLine;
    h.people = data.people.map((p) => {
      const existing = h.people.find((x) => x.id === p.id);
      return existing ? { ...existing, name: p.name, isChild: p.isChild } : this.person({ ...p, id: null });
    });
  }
  async deleteHousehold(websiteId: string, householdId: string) {
    this.households = this.households.filter((h) => !(h.id === householdId && h.websiteId === websiteId));
  }
  async saveResponse(householdId: string, response: HouseholdResponse, at: Date) {
    const h = this.households.find((x) => x.id === householdId)!;
    for (const answer of response.people) {
      const { guestId, ...rest } = answer;
      Object.assign(h.people.find((p) => p.id === guestId)!, copy(rest));
    }
    h.pollAnswers = copy(response.pollAnswers);
    h.message = response.message;
    h.respondedAt = at;
    for (const name of response.requests) h.requests.push({ id: this.id("request"), name, status: "pending", createdAt: at, decidedAt: null });
  }
  async decideRequest(websiteId: string, requestId: string, status: "added" | "declined", at: Date) {
    const h = this.households.find((x) => x.websiteId === websiteId && x.requests.some((r) => r.id === requestId));
    const request = h?.requests.find((r) => r.id === requestId);
    if (!h || !request || request.status !== "pending") return false;
    request.status = status;
    request.decidedAt = at;
    if (status === "added") h.people.push({ ...this.person({ id: null, name: request.name, isChild: false }), fromRequest: true });
    return true;
  }
  async unsubscribe(householdId: string, at: Date) {
    const h = this.households.find((x) => x.id === householdId);
    if (!h) return false;
    h.email = null;
    h.unsubscribedAt ??= at;
    return true;
  }
  async deleteGuestData(websiteId: string) {
    const before = this.households.length;
    this.households = this.households.filter((h) => h.websiteId !== websiteId);
    return before - this.households.length;
  }
  async listWebsiteIdsWithGuests() {
    return [...new Set(this.households.map((h) => h.websiteId))];
  }
  async listWebsiteIdsWithDailySummary() {
    return [...this.settings.entries()].filter(([, s]) => s.notify === "daily").map(([id]) => id);
  }
  async lastSummaryAt(websiteId: string) {
    return this.state(websiteId).lastSummaryAt;
  }
  async claimDailySummary(websiteId: string, previous: Date | null, at: Date) {
    const state = this.state(websiteId);
    if ((state.lastSummaryAt?.getTime() ?? null) !== (previous?.getTime() ?? null)) return false;
    state.lastSummaryAt = at;
    return true;
  }
  async claimRetentionWarning(websiteId: string, deleteAt: Date) {
    const state = this.state(websiteId);
    if (state.warnedFor?.getTime() === deleteAt.getTime()) return false;
    state.warnedFor = deleteAt;
    return true;
  }
  /** Stands in for ON DELETE CASCADE from websites. */
  dropWebsite(websiteId: string) {
    this.households = this.households.filter((h) => h.websiteId !== websiteId);
    this.polls = this.polls.filter((p) => p.websiteId !== websiteId);
    this.settings.delete(websiteId);
  }
}

export const fakeGuestLinks: GuestLinks = {
  tokenFor: (householdId) => `link-${householdId}`,
  hash: (token) => createHash("sha256").update(token).digest("hex"),
  unsubscribeTokenFor: (householdId) => `stop-${householdId}`,
  verifyUnsubscribe: (token) => (token.startsWith("stop-") ? token.slice(5) : null),
};

export const fakeCardMail: CardMailTemplates = {
  card: (m) => ({ subject: `${m.kind}: ${m.couple}`, text: JSON.stringify(m), html: `<img src="cid:${m.imageCid}">` }),
  reminder: (m) => ({ subject: `Erinnerung: ${m.couple}`, text: JSON.stringify(m), html: "" }),
};

export const fakeCardTexts: CardTexts = {
  labels: {
    locale: "de",
    eyebrow: { saveTheDate: "Save the Date", invitation: "Einladung", thankYou: "Danke", engagement: "Verlobung" },
    replyBy: "Bitte antwortet bis {date}",
    time: "{time} Uhr",
  },
  defaults: {
    saveTheDate: { heading: "", text: "Einladung folgt", message: "Hallo {name}, merkt euch den Tag!" },
    invitation: { heading: "Wir heiraten", text: "Feiert mit uns", message: "Hallo {name}, hier ist eure Einladung." },
    thankYou: { heading: "Danke", text: "Es war wunderschön.", message: "Hallo {name}, danke!" },
    engagement: { heading: "Wir haben uns verlobt", text: "", message: "" },
  },
  reminderMessage: "Hallo {name}, denkt an eure Antwort.",
  sampleHousehold: "Familie Beispiel",
  calendarTitle: "Hochzeit von {couple}",
};

/** Records what it was asked to draw; the bytes say which card and format. */
export class FakeCardRenderer implements CardRenderer {
  calls: { kind: CardKind; personalLine: string | null; format: string; photo: boolean }[] = [];
  async png(model: Parameters<CardRenderer["png"]>[0], photo: Uint8Array | null, width: number) {
    this.calls.push({ kind: model.kind, personalLine: model.personalLine, format: `png-${width}`, photo: !!photo });
    return new TextEncoder().encode(`png:${model.kind}:${model.names}`);
  }
  async pdf(model: Parameters<CardRenderer["pdf"]>[0], photo: Uint8Array | null, format: string) {
    this.calls.push({ kind: model.kind, personalLine: model.personalLine, format, photo: !!photo });
    return new TextEncoder().encode(`pdf:${format}:${model.kind}`);
  }
}

const emptyDelivery = (): Delivery => ({
  excluded: false,
  sharedAt: null,
  sharedVia: null,
  emailQueuedAt: null,
  emailedAt: null,
  emailError: null,
  openedAt: null,
  reminderOffset: null,
  reminderQueuedAt: null,
  remindedAt: null,
  reminderError: null,
});

type FakeDelivery = DeliveryRecord & { emailClaimedAt: Date | null; reminderClaimedAt: Date | null };

export class InMemoryCards implements CardRepository {
  cards: Card[] = [];
  deliveries: FakeDelivery[] = [];
  private n = 0;
  constructor(private guests: InMemoryGuests) {}

  /** Deliveries go with their household (ON DELETE CASCADE). */
  private live() {
    this.deliveries = this.deliveries.filter((d) => this.guests.households.some((h) => h.id === d.householdId) && this.cards.some((c) => c.id === d.cardId));
    return this.deliveries;
  }
  private row(cardId: string, householdId: string): FakeDelivery {
    let d = this.live().find((x) => x.cardId === cardId && x.householdId === householdId);
    if (!d) {
      d = { ...emptyDelivery(), cardId, householdId, emailClaimedAt: null, reminderClaimedAt: null };
      this.deliveries.push(d);
    }
    return d;
  }
  private plain = (d: FakeDelivery): DeliveryRecord => omit(omit(copy(d), "emailClaimedAt"), "reminderClaimedAt");

  async create(card: NewCard) {
    if (this.cards.some((c) => c.websiteId === card.websiteId && c.kind === card.kind)) return null;
    const created = { ...copy(card), id: `card-${++this.n}`, createdAt: new Date(), updatedAt: new Date() };
    this.cards.push(created);
    return copy(created);
  }
  async find(websiteId: string, kind: CardKind) {
    const card = this.cards.find((c) => c.websiteId === websiteId && c.kind === kind);
    return card ? copy(card) : null;
  }
  async listByWebsite(websiteId: string) {
    return copy(this.cards.filter((c) => c.websiteId === websiteId));
  }
  async update(websiteId: string, kind: CardKind, input: CardInput) {
    const card = this.cards.find((c) => c.websiteId === websiteId && c.kind === kind);
    if (card) Object.assign(card, copy(input), { updatedAt: new Date() });
  }
  async delete(websiteId: string, kind: CardKind) {
    this.cards = this.cards.filter((c) => !(c.websiteId === websiteId && c.kind === kind));
  }
  async listDeliveries(cardId: string) {
    return this.live().filter((d) => d.cardId === cardId).map(this.plain);
  }
  async listDeliveriesOfHousehold(householdId: string) {
    return this.live().filter((d) => d.householdId === householdId).map(this.plain);
  }
  async setExcluded(cardId: string, householdId: string, excluded: boolean) {
    this.row(cardId, householdId).excluded = excluded;
  }
  async markShared(cardId: string, householdId: string, via: SharedVia, at: Date) {
    const d = this.row(cardId, householdId);
    if (d.sharedAt) return;
    d.sharedAt = at;
    d.sharedVia = via;
  }
  async markOpened(cardId: string, householdId: string, at: Date) {
    const d = this.row(cardId, householdId);
    if (d.openedAt) return false;
    d.openedAt = at;
    return true;
  }
  private fields(channel: MailChannel) {
    return channel === "card"
      ? ({ queued: "emailQueuedAt", claimed: "emailClaimedAt", sent: "emailedAt", error: "emailError" } as const)
      : ({ queued: "reminderQueuedAt", claimed: "reminderClaimedAt", sent: "remindedAt", error: "reminderError" } as const);
  }
  async queueMail(channel: MailChannel, cardId: string, householdIds: string[], at: Date) {
    const f = this.fields(channel);
    let queued = 0;
    for (const id of householdIds) {
      const d = this.row(cardId, id);
      if (d[f.claimed]) continue;
      d[f.queued] = at;
      d[f.error] = null;
      queued++;
    }
    return queued;
  }
  async listQueuedMail(limit: number, websiteId?: string): Promise<QueuedMail[]> {
    const result: QueuedMail[] = [];
    for (const d of this.live()) {
      const card = this.cards.find((c) => c.id === d.cardId)!;
      if (websiteId && card.websiteId !== websiteId) continue;
      if (d.emailQueuedAt && !d.emailClaimedAt) result.push({ cardId: d.cardId, householdId: d.householdId, websiteId: card.websiteId, channel: "card" });
      if (d.reminderQueuedAt && !d.reminderClaimedAt) result.push({ cardId: d.cardId, householdId: d.householdId, websiteId: card.websiteId, channel: "reminder" });
    }
    return result.slice(0, limit);
  }
  async claimMail(channel: MailChannel, cardId: string, householdId: string, at: Date) {
    const f = this.fields(channel);
    const d = this.live().find((x) => x.cardId === cardId && x.householdId === householdId);
    if (!d || !d[f.queued] || d[f.claimed]) return false;
    d[f.claimed] = at;
    return true;
  }
  async finishMail(channel: MailChannel, cardId: string, householdId: string, outcome: { sentAt: Date } | { error: string }) {
    const f = this.fields(channel);
    const d = this.live().find((x) => x.cardId === cardId && x.householdId === householdId);
    if (!d) return;
    d[f.queued] = null;
    d[f.claimed] = null;
    if ("sentAt" in outcome) {
      d[f.sent] = outcome.sentAt;
      d[f.error] = null;
    } else d[f.error] = outcome.error;
  }
  async failStaleClaims(before: Date) {
    let n = 0;
    for (const d of this.live()) {
      for (const channel of ["card", "reminder"] as const) {
        const f = this.fields(channel);
        const claimed = d[f.claimed];
        if (claimed && claimed < before) {
          d[f.queued] = null;
          d[f.claimed] = null;
          d[f.error] = "interrupted";
          n++;
        }
      }
    }
    return n;
  }
  async claimAutomaticReminder(cardId: string, householdId: string, offset: number, at: Date) {
    const d = this.row(cardId, householdId);
    if (d.reminderOffset !== null && d.reminderOffset <= offset) return false;
    d.reminderOffset = offset;
    d.remindedAt = at;
    return true;
  }
  async listInvitationsWithReminders() {
    return this.cards.filter((c) => c.kind === "invitation" && c.reminderDays.length > 0).map((c) => ({ websiteId: c.websiteId, cardId: c.id }));
  }
  dropWebsite(websiteId: string) {
    this.cards = this.cards.filter((c) => c.websiteId !== websiteId);
  }
}

export const fakeGuestMail: GuestMailTemplates = {
  answer: (m) => ({ subject: `Antwort: ${m.household}`, text: JSON.stringify(m), html: "" }),
  dailySummary: (m) => ({ subject: `Zusammenfassung: ${m.websiteTitle}`, text: JSON.stringify(m), html: "" }),
  retentionWarning: (m) => ({ subject: `Löschung: ${m.websiteTitle}`, text: JSON.stringify(m), html: "" }),
};

export const fakeMailTemplate: MagicLinkMailTemplate = {
  render: (link, minutes) => ({ subject: "Login", text: `${link} (${minutes})`, html: `<a href="${link}">login</a>` }),
};

const palette = (id: string) => ({
  id,
  name: { de: id },
  colors: { background: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#555555", primary: "#336699", accent: "#cc9933" },
});

export function themeFixture(id: string, paletteIds = ["hell", "dunkel"], withCards = true): ThemeManifest {
  const parsed = parseThemeManifest(
    {
      id,
      name: { de: id },
      category: { de: "Test" },
      palettes: paletteIds.map(palette),
      fonts: { defaultPairing: "klassisch" },
      assets: { preview: "preview.svg" },
      cards: withCards
        ? {
            layouts: [
              { id: "bogen", name: { de: "Bogen" }, photo: "masked", photoMask: "frame.svg", ornament: "divider.svg" },
              { id: "schlicht", name: { de: "Schlicht" }, kinds: ["thankYou", "engagement"], photo: "none" },
            ],
          }
        : undefined,
    },
    id,
  );
  if (!parsed.ok) throw new Error("bad theme fixture");
  return parsed.value;
}

export class FakeThemes implements ThemeCatalog {
  constructor(private themes: ThemeManifest[] = [themeFixture("salbei"), themeFixture("terrakotta")]) {}
  list() {
    return this.themes;
  }
  get(id: string) {
    return this.themes.find((t) => t.id === id);
  }
  defaultThemeId() {
    return this.themes[0]!.id;
  }
  readSvg(themeId: string, file: string) {
    return this.get(themeId) ? `<svg xmlns="http://www.w3.org/2000/svg"><!-- ${themeId}/${file} --></svg>` : null;
  }
}

export function createFakes() {
  const websites = new InMemoryWebsites();
  const billingRepo = new InMemoryBilling(websites);
  const guests = new InMemoryGuests();
  const cards = new InMemoryCards(guests);
  websites.cascades.push((id) => guests.dropWebsite(id), (id) => cards.dropWebsite(id));
  const fakes = {
    users: new InMemoryUsers(),
    magicLinks: new InMemoryMagicLinks(),
    sessions: new InMemorySessions(),
    rateLimiter: new InMemoryRateLimiter(),
    websites,
    uploads: new InMemoryUploads(),
    storage: new InMemoryStorage(),
    images: new FakeImageProcessor(),
    mailer: new FakeMailer(),
    mailTemplate: fakeMailTemplate,
    themes: new FakeThemes(),
    clock: new FakeClock(),
    tokens: new FakeTokens(),
    billing: {
      enabled: true,
      offers: [
        { tier: "rsvp" as const, priceCents: 4900, productId: "prod_rsvp" },
        // No product: shows how a tier the operator does not sell yet behaves.
        { tier: "invitations" as const, priceCents: 13900, productId: null as string | null },
        { tier: "complete" as const, priceCents: 14900, productId: "prod_all" },
      ],
      unlockedTiers: [] as ("rsvp" | "invitations" | "complete")[],
    },
    billingRepo,
    payments: new FakePayments() as FakePayments | null,
    archive: new FakeArchive(),
    guests,
    guestLinks: fakeGuestLinks,
    guestMail: fakeGuestMail,
    cards,
    cardRenderer: new FakeCardRenderer(),
    cardMail: fakeCardMail,
    cardTexts: fakeCardTexts,
    mailRate: { batchSize: 50, intervalMs: 0 },
    appUrl: "http://localhost:3000",
  };
  fakes.users.cascades.push((userId) => {
    const owned = new Set(websites.websites.filter((w) => w.ownerId === userId).map((w) => w.id));
    for (const id of owned) void websites.delete(id);
    fakes.sessions.sessions = fakes.sessions.sessions.filter((s) => s.userId !== userId);
    fakes.uploads.uploads = fakes.uploads.uploads.filter((u) => u.ownerId !== userId);
    billingRepo.entitlements = billingRepo.entitlements.filter((e) => !owned.has(e.websiteId));
  });
  const deps: Deps = fakes;
  return { ...fakes, deps };
}

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
