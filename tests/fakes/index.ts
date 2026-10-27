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
  SheetRead,
  SpreadsheetCodec,
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
  Invitation,
  InvitationRepository,
  Member,
  GuestImportBatch,
  NewPoll,
  PollRecord,
  Block,
  InvitationMailTemplate,
  MagicLinkMailTemplate,
  MagicLinkRecord,
  MagicLinkRepository,
  MailMessage,
  Mailer,
  RateLimiter,
  NewSection,
  Section,
  SectionPatch,
  SessionRecord,
  SessionRepository,
  SiteTexts,
  StoredFile,
  ThemeCatalog,
  TokenGenerator,
  UploadRepository,
  NewWebsite,
  NewWedding,
  OpenRecord,
  User,
  UserRepository,
  Website,
  WebsiteRepository,
  Wedding,
  WeddingEvent,
  WeddingPatch,
  WeddingRepository,
} from "@/application/ports";
import type { Deps } from "@/application/deps";
import { compareEvents, type BlockData, type EventData } from "@/domain/sections";
import { DEFAULT_RSVP_SETTINGS, type AnswerSource, type Household, type HouseholdResponse, type RsvpSettings } from "@/domain/guests";
import { parseThemeManifest, type ThemeManifest } from "@/domain/theme";
import type { CardInput, CardKind, Delivery, HouseholdCardKind, SharedVia } from "@/domain/cards";
import type { AssignableItem, Assignment } from "@/domain/weddings";
import type { Role } from "@/domain/members";

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
  /** Set by createFakes: deletes weddings in the in-memory wedding repository. */
  deleteWeddings: (ids: string[]) => Promise<void> = async () => {};
  /** Set by createFakes: hands a wedding's contact person to another user. */
  setContact: (weddingId: string, userId: string) => Promise<void> = async () => {};
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
  async delete(id: string, weddingIds: string[] = [], handovers: { weddingId: string; contactUserId: string }[] = []) {
    await this.deleteWeddings(weddingIds);
    for (const h of handovers) await this.setContact(h.weddingId, h.contactUserId);
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

export class InMemoryWeddings implements WeddingRepository {
  weddings: Wedding[] = [];
  members: { weddingId: string; userId: string; role: Role; createdAt: Date }[] = [];
  events: (WeddingEvent & { weddingId: string })[] = [];
  /** Stands in for ON DELETE CASCADE from weddings. */
  cascades: ((weddingId: string) => void)[] = [];
  constructor(
    private websites: InMemoryWebsites,
    private users: InMemoryUsers,
  ) {}

  async create({ creatorId, ...input }: NewWedding) {
    const now = new Date();
    const wedding: Wedding = { id: randomUUID(), location: null, latitude: null, longitude: null, lastOpenedAt: null, createdAt: now, updatedAt: now, ...input, contactUserId: creatorId };
    this.weddings.push(wedding);
    this.members.push({ weddingId: wedding.id, userId: creatorId, role: "admin", createdAt: now });
    return copy(wedding);
  }
  async findById(id: string) {
    return copy(this.weddings.find((w) => w.id === id) ?? null);
  }
  async findBySlug(slug: string) {
    return copy(this.weddings.find((w) => w.slug === slug) ?? null);
  }
  async listForMember(userId: string) {
    return this.members.filter((m) => m.userId === userId).map((m) => ({ ...copy(this.weddings.find((w) => w.id === m.weddingId)!), role: m.role }));
  }
  async roleOf(weddingId: string, userId: string) {
    return this.members.find((m) => m.weddingId === weddingId && m.userId === userId)?.role ?? null;
  }
  async listMembers(weddingId: string): Promise<Member[]> {
    return this.members
      .filter((m) => m.weddingId === weddingId)
      .map((m) => {
        const user = this.users.users.find((u) => u.id === m.userId)!;
        return { userId: m.userId, email: user.email, firstName: user.firstName, role: m.role, createdAt: m.createdAt };
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async addMember(weddingId: string, userId: string, role: Role) {
    if (await this.roleOf(weddingId, userId)) return;
    this.members.push({ weddingId, userId, role, createdAt: new Date() });
  }
  async setRole(weddingId: string, userId: string, role: Role) {
    const member = this.members.find((m) => m.weddingId === weddingId && m.userId === userId);
    if (member) member.role = role;
  }
  async removeMember(weddingId: string, userId: string) {
    this.members = this.members.filter((m) => !(m.weddingId === weddingId && m.userId === userId));
  }
  async update(id: string, patch: WeddingPatch) {
    const wedding = this.weddings.find((w) => w.id === id)!;
    Object.assign(wedding, patch, { updatedAt: new Date() });
    return copy(wedding);
  }
  private uses = 0;
  async markUsed(id: string) {
    const wedding = this.weddings.find((w) => w.id === id);
    // Wall-clock time in the database; here simply later than every use before.
    if (wedding) wedding.lastOpenedAt = new Date(Date.UTC(2000, 0, 1) + ++this.uses * 1000);
  }
  async delete(id: string) {
    this.weddings = this.weddings.filter((w) => w.id !== id);
    this.members = this.members.filter((m) => m.weddingId !== id);
    this.events = this.events.filter((e) => e.weddingId !== id);
    for (const site of this.websites.websites.filter((w) => w.weddingId === id)) await this.websites.delete(site.id);
    for (const cascade of this.cascades) cascade(id);
  }
  async slugOwners(slug: string) {
    return {
      weddingIds: this.weddings.filter((w) => w.slug === slug).map((w) => w.id),
      websites: this.websites.websites.filter((w) => w.slug === slug).map((w) => ({ id: w.id, weddingId: w.weddingId })),
    };
  }
  async listEvents(weddingId: string) {
    return copy(this.events.filter((e) => e.weddingId === weddingId))
      .map((e) => omit(e, "weddingId"))
      .sort(compareEvents);
  }
  async findEvent(weddingId: string, eventId: string) {
    const event = this.events.find((e) => e.weddingId === weddingId && e.id === eventId);
    return event ? omit(copy(event), "weddingId") : null;
  }
  async addEvent(weddingId: string, data: EventData) {
    const event = { id: randomUUID(), weddingId, data: copy(data) };
    this.events.push(event);
    return omit(copy(event), "weddingId");
  }
  async updateEvent(eventId: string, data: EventData) {
    this.events.find((e) => e.id === eventId)!.data = copy(data);
  }
  async deleteEvent(eventId: string) {
    this.events = this.events.filter((e) => e.id !== eventId);
    this.websites.blocks = this.websites.blocks.filter((b) => !(b.data.type === "event" && b.data.eventId === eventId));
  }
}

export class InMemoryInvitations implements InvitationRepository {
  invitations: (Invitation & { tokenHash: string })[] = [];
  async replace(input: Omit<Invitation, "id" | "createdAt"> & { tokenHash: string }) {
    this.invitations = this.invitations.filter((i) => !(i.weddingId === input.weddingId && i.email === input.email));
    const invitation = { ...input, id: randomUUID(), createdAt: new Date() };
    this.invitations.push(invitation);
    return omit(copy(invitation), "tokenHash");
  }
  async findByHash(tokenHash: string) {
    const invitation = this.invitations.find((i) => i.tokenHash === tokenHash);
    return invitation ? omit(copy(invitation), "tokenHash") : null;
  }
  async listPending(weddingId: string, now: Date) {
    return this.invitations.filter((i) => i.weddingId === weddingId && i.expiresAt > now).map((i) => omit(copy(i), "tokenHash"));
  }
  async delete(id: string) {
    const before = this.invitations.length;
    this.invitations = this.invitations.filter((i) => i.id !== id);
    return this.invitations.length < before;
  }
}

export class InMemoryWebsites implements WebsiteRepository {
  websites: Website[] = [];
  sections: (Section & { websiteId: string })[] = [];
  blocks: (Block & { websiteId: string })[] = [];
  /** Stands in for ON DELETE CASCADE from websites. */
  cascades: ((websiteId: string) => void)[] = [];

  async create(input: NewWebsite, sections: NewSection[]) {
    if (this.websites.some((w) => w.slug === input.slug)) throw new Error("duplicate slug");
    const now = new Date();
    const website: Website = { ...copy(input), id: randomUUID(), createdAt: now, updatedAt: now };
    this.websites.push(website);
    for (const section of sections) await this.addSection(website.id, section);
    return copy(website);
  }
  async findById(id: string) {
    return copy(this.websites.find((w) => w.id === id) ?? null);
  }
  async findBySlug(slug: string) {
    return copy(this.websites.find((w) => w.slug === slug) ?? null);
  }
  async listByWedding(weddingId: string) {
    return copy(this.websites.filter((w) => w.weddingId === weddingId).sort((a, b) => a.position - b.position));
  }
  async update(id: string, patch: Partial<Website>) {
    const website = this.websites.find((w) => w.id === id)!;
    Object.assign(website, copy(patch), { updatedAt: new Date() });
    return copy(website);
  }
  async delete(id: string) {
    this.websites = this.websites.filter((w) => w.id !== id);
    this.sections = this.sections.filter((s) => s.websiteId !== id);
    this.blocks = this.blocks.filter((b) => b.websiteId !== id);
    for (const cascade of this.cascades) cascade(id);
  }

  async listSections(websiteId: string) {
    return copy(this.sections.filter((s) => s.websiteId === websiteId))
      .sort((a, b) => a.position - b.position)
      .map((s) => omit(s, "websiteId"));
  }
  async findSection(websiteId: string, sectionId: string) {
    const section = this.sections.find((s) => s.websiteId === websiteId && s.id === sectionId);
    return section ? omit(copy(section), "websiteId") : null;
  }
  async addSection(websiteId: string, { blocks, ...input }: NewSection) {
    const position = Math.max(-1, ...this.sections.filter((s) => s.websiteId === websiteId).map((s) => s.position)) + 1;
    const section = { ...copy(input), id: randomUUID(), websiteId, position };
    this.sections.push(section);
    for (const data of blocks) await this.addBlock(websiteId, section.id, data);
    return omit(copy(section), "websiteId");
  }
  async updateSection(sectionId: string, patch: SectionPatch) {
    Object.assign(this.sections.find((s) => s.id === sectionId)!, copy(patch));
  }
  async deleteSection(sectionId: string) {
    this.sections = this.sections.filter((s) => s.id !== sectionId);
    this.blocks = this.blocks.filter((b) => b.sectionId !== sectionId);
  }
  async setSectionOrder(websiteId: string, orderedIds: string[]) {
    orderedIds.forEach((id, position) => {
      const section = this.sections.find((s) => s.id === id && s.websiteId === websiteId);
      if (section) section.position = position;
    });
  }

  async listBlocks(websiteId: string) {
    const sectionPosition = new Map(this.sections.map((s) => [s.id, s.position]));
    return copy(this.blocks.filter((b) => b.websiteId === websiteId))
      .sort((a, b) => sectionPosition.get(a.sectionId)! - sectionPosition.get(b.sectionId)! || a.position - b.position)
      .map((b) => omit(b, "websiteId"));
  }
  async findBlock(websiteId: string, blockId: string) {
    const block = this.blocks.find((b) => b.websiteId === websiteId && b.id === blockId);
    return block ? omit(copy(block), "websiteId") : null;
  }
  async addBlock(websiteId: string, sectionId: string, data: BlockData) {
    const position = Math.max(-1, ...this.blocks.filter((b) => b.sectionId === sectionId).map((b) => b.position)) + 1;
    const block = { id: randomUUID(), websiteId, sectionId, position, data: copy(data) };
    this.blocks.push(block);
    return omit(copy(block), "websiteId");
  }
  async updateBlock(blockId: string, data: BlockData) {
    this.blocks.find((b) => b.id === blockId)!.data = copy(data);
  }
  async deleteBlock(blockId: string) {
    this.blocks = this.blocks.filter((b) => b.id !== blockId);
  }
  async setBlockOrder(sectionId: string, orderedIds: string[]) {
    orderedIds.forEach((id, position) => {
      const block = this.blocks.find((b) => b.id === id && b.sectionId === sectionId);
      if (block) block.position = position;
    });
  }
}

export class InMemoryUploads implements UploadRepository {
  uploads: { key: string; uploadedBy: string | null; weddingId: string; contentType: string; size: number; createdAt: Date }[] = [];
  async create(input: Omit<InMemoryUploads["uploads"][number], "createdAt" | "uploadedBy"> & { uploadedBy: string }) {
    this.uploads.push({ ...input, createdAt: new Date() });
  }
  async belongsToWedding(key: string, weddingId: string) {
    return this.uploads.some((u) => u.key === key && u.weddingId === weddingId);
  }
  async listKeysByWedding(weddingId: string) {
    return this.uploads.filter((u) => u.weddingId === weddingId).map((u) => u.key);
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
  constructor(private weddings: InMemoryWeddings) {}
  async applyEvent(eventId: string, change: BillingChange) {
    if (this.events.has(eventId)) return "duplicate" as const;
    this.events.add(eventId);
    if (change.kind === "grant" && !this.entitlements.some((e) => e.purchaseRef === change.purchaseRef)) {
      const { weddingId, tier, purchaseRef, provider, validUntil, purchasedBy } = change;
      this.entitlements.push({ id: randomUUID(), revokedAt: null, createdAt: new Date(), weddingId, tier, purchaseRef, provider, validUntil, purchasedBy });
    }
    if (change.kind === "revoke") {
      for (const e of this.entitlements) if (e.purchaseRef === change.purchaseRef && !e.revokedAt) e.revokedAt = change.at;
    }
    return "applied" as const;
  }
  async listByWedding(weddingId: string) {
    return copy(this.entitlements.filter((e) => e.weddingId === weddingId));
  }
  async listForAdmin(userId: string) {
    const ids = new Set(this.weddings.members.filter((m) => m.userId === userId && m.role === "admin").map((m) => m.weddingId));
    return copy(this.entitlements.filter((e) => ids.has(e.weddingId)));
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

/** Returns a preset table; writeXlsx records what it was given. */
export class FakeSpreadsheets implements SpreadsheetCodec {
  result: SheetRead = { ok: true, rows: [] };
  written: string[][][] = [];
  read(): SheetRead {
    return this.result;
  }
  writeXlsx(rows: string[][]) {
    this.written.push(rows);
    return new TextEncoder().encode(JSON.stringify(rows));
  }
}

export class InMemoryGuests implements GuestRepository {
  settings = new Map<string, RsvpSettings & { lastSummaryAt: Date | null; warnedFor: Date | null }>();
  polls: (PollRecord & { weddingId: string })[] = [];
  households: (Household & { weddingId: string; tokenHash: string })[] = [];
  assignments: (Assignment & { target: { cardId: string } | { websiteId: string } })[] = [];
  private n = 0;
  private id = (prefix: string) => `${prefix}-${++this.n}`;

  private state(weddingId: string) {
    if (!this.settings.has(weddingId)) this.settings.set(weddingId, { ...DEFAULT_RSVP_SETTINGS, lastSummaryAt: null, warnedFor: null });
    return this.settings.get(weddingId)!;
  }
  async getSettings(weddingId: string) {
    const { replyBy, eventIds, meal, notify, whatsappMessage } = this.state(weddingId);
    return copy({ replyBy, eventIds, meal, notify, whatsappMessage });
  }
  async saveSettings(weddingId: string, settings: RsvpSettings) {
    Object.assign(this.state(weddingId), copy(settings));
  }
  async listPolls(weddingId: string) {
    return copy(this.polls.filter((p) => p.weddingId === weddingId)).map((p) => omit(p, "weddingId"));
  }
  async createPoll(weddingId: string, poll: NewPoll) {
    const record = { ...copy(poll), id: this.id("poll"), position: this.polls.length, weddingId };
    this.polls.push(record);
    return omit(copy(record), "weddingId");
  }
  async updatePoll(weddingId: string, pollId: string, poll: NewPoll) {
    const record = this.polls.find((p) => p.id === pollId && p.weddingId === weddingId);
    if (!record) return false;
    Object.assign(record, copy(poll));
    return true;
  }
  async deletePoll(weddingId: string, pollId: string) {
    this.polls = this.polls.filter((p) => !(p.id === pollId && p.weddingId === weddingId));
  }
  private strip = (h: InMemoryGuests["households"][number]): Household => omit(omit(copy(h), "weddingId"), "tokenHash");
  async listHouseholds(weddingId: string) {
    return this.households.filter((h) => h.weddingId === weddingId).map(this.strip);
  }
  async findHousehold(weddingId: string, householdId: string) {
    const h = this.households.find((x) => x.id === householdId && x.weddingId === weddingId);
    return h ? this.strip(h) : null;
  }
  async findByTokenHash(tokenHash: string) {
    const h = this.households.find((x) => x.tokenHash === tokenHash);
    return h ? { weddingId: h.weddingId, household: this.strip(h) } : null;
  }
  private person = (p: HouseholdData["people"][number]) => ({
    id: p.id ?? this.id("guest"),
    name: p.name,
    isChild: p.isChild,
    email: p.email,
    attending: null,
    eventIds: [],
    mealOptionId: null,
    allergies: "",
    pollAnswers: {},
    fromRequest: false,
  });
  async createHousehold(weddingId: string, data: HouseholdData, tokenHashFor: (id: string) => string) {
    const id = this.id("household");
    const household = {
      id,
      weddingId,
      tokenHash: tokenHashFor(id),
      name: data.name,
      invitedEventIds: data.invitedEventIds,
      message: "",
      pollAnswers: {},
      respondedAt: null,
      answeredBy: null,
      createdAt: new Date(),
      personalLine: data.personalLine,
      unsubscribedAt: null,
      people: data.people.map((p) => this.person({ ...p, id: null })),
      requests: [],
    };
    this.households.push(household);
    return this.strip(household);
  }
  async importGuests(weddingId: string, batch: GuestImportBatch, tokenHashFor: (id: string) => string) {
    // All or nothing, like the transaction: check everything before writing.
    const own = (id: string) => this.households.find((h) => h.id === id && h.weddingId === weddingId);
    for (const j of batch.join) if (!own(j.householdId)) throw new Error("household not found");
    for (const o of batch.overwrite) if (!this.households.some((h) => h.weddingId === weddingId && h.people.some((p) => p.id === o.guestId))) throw new Error("guest not found");
    for (const c of batch.create) {
      const id = this.id("household");
      this.households.push({
        id,
        weddingId,
        tokenHash: tokenHashFor(id),
        name: c.name,
        invitedEventIds: c.invitedEventIds,
        message: "",
        pollAnswers: {},
        respondedAt: null,
        answeredBy: null,
        createdAt: new Date(),
        personalLine: c.personalLine,
        unsubscribedAt: null,
        people: c.people.map((p) => ({ ...this.person({ ...p, id: null }), allergies: p.allergies })),
        requests: [],
      });
    }
    for (const j of batch.join) own(j.householdId)!.people.push(...j.people.map((p) => ({ ...this.person({ ...p, id: null }), allergies: p.allergies })));
    for (const o of batch.overwrite) {
      const guest = this.households.filter((h) => h.weddingId === weddingId).flatMap((h) => h.people).find((p) => p.id === o.guestId)!;
      Object.assign(guest, { name: o.name, isChild: o.isChild, email: o.email, allergies: o.allergies });
    }
  }
  async updateHousehold(weddingId: string, householdId: string, data: HouseholdData) {
    const h = this.households.find((x) => x.id === householdId && x.weddingId === weddingId)!;
    h.name = data.name;
    h.invitedEventIds = data.invitedEventIds;
    const before = new Set(h.people.flatMap((x) => (x.email ? [x.email] : [])));
    if (data.people.some((p) => p.email && !before.has(p.email))) h.unsubscribedAt = null;
    h.personalLine = data.personalLine;
    h.people = data.people.map((p) => {
      const existing = h.people.find((x) => x.id === p.id);
      return existing ? { ...existing, name: p.name, isChild: p.isChild, email: p.email } : this.person({ ...p, id: null });
    });
  }
  async deleteHousehold(weddingId: string, householdId: string) {
    this.households = this.households.filter((h) => !(h.id === householdId && h.weddingId === weddingId));
  }
  async saveResponse(householdId: string, response: HouseholdResponse, at: Date, by: AnswerSource) {
    const h = this.households.find((x) => x.id === householdId)!;
    for (const answer of response.people) {
      const { guestId, ...rest } = answer;
      Object.assign(h.people.find((p) => p.id === guestId)!, copy(rest));
    }
    h.pollAnswers = copy(response.pollAnswers);
    h.message = response.message;
    h.respondedAt = at;
    h.answeredBy = by;
    for (const name of response.requests) h.requests.push({ id: this.id("request"), name, status: "pending", createdAt: at, decidedAt: null });
  }
  async decideRequest(weddingId: string, requestId: string, status: "added" | "declined", at: Date) {
    const h = this.households.find((x) => x.weddingId === weddingId && x.requests.some((r) => r.id === requestId));
    const request = h?.requests.find((r) => r.id === requestId);
    if (!h || !request || request.status !== "pending") return false;
    request.status = status;
    request.decidedAt = at;
    if (status === "added") h.people.push({ ...this.person({ id: null, name: request.name, isChild: false, email: null }), fromRequest: true });
    return true;
  }
  /** Version choices go with their household and their version (ON DELETE CASCADE). */
  liveAssignments(versionExists: (id: string) => boolean) {
    this.assignments = this.assignments.filter((a) => this.households.some((h) => h.id === a.householdId) && versionExists(a.versionId));
    return this.assignments;
  }
  versionExists: (id: string) => boolean = () => true;
  async listAssignments(weddingId: string) {
    const ids = new Set(this.households.filter((h) => h.weddingId === weddingId).map((h) => h.id));
    return this.liveAssignments(this.versionExists)
      .filter((a) => ids.has(a.householdId))
      .map(({ householdId, item, versionId }) => ({ householdId, item, versionId }));
  }
  async assign(householdId: string, item: AssignableItem, target: { cardId: string } | { websiteId: string }) {
    this.assignments = this.assignments.filter((a) => !(a.householdId === householdId && a.item === item));
    this.assignments.push({ householdId, item, versionId: "cardId" in target ? target.cardId : target.websiteId, target });
  }
  async unsubscribe(householdId: string, at: Date) {
    const h = this.households.find((x) => x.id === householdId);
    if (!h) return false;
    for (const p of h.people) p.email = null;
    h.unsubscribedAt ??= at;
    return true;
  }
  async deleteGuestData(weddingId: string) {
    const before = this.households.length;
    this.households = this.households.filter((h) => h.weddingId !== weddingId);
    return before - this.households.length;
  }
  async listWeddingIdsWithGuests() {
    return [...new Set(this.households.map((h) => h.weddingId))];
  }
  async listWeddingIdsWithDailySummary() {
    return [...this.settings.entries()].filter(([, s]) => s.notify === "daily").map(([id]) => id);
  }
  async lastSummaryAt(weddingId: string) {
    return this.state(weddingId).lastSummaryAt;
  }
  async claimDailySummary(weddingId: string, previous: Date | null, at: Date) {
    const state = this.state(weddingId);
    if ((state.lastSummaryAt?.getTime() ?? null) !== (previous?.getTime() ?? null)) return false;
    state.lastSummaryAt = at;
    return true;
  }
  async claimRetentionWarning(weddingId: string, deleteAt: Date) {
    const state = this.state(weddingId);
    if (state.warnedFor?.getTime() === deleteAt.getTime()) return false;
    state.warnedFor = deleteAt;
    return true;
  }
  /** Stands in for ON DELETE CASCADE from weddings. */
  dropWedding(weddingId: string) {
    this.households = this.households.filter((h) => h.weddingId !== weddingId);
    this.polls = this.polls.filter((p) => p.weddingId !== weddingId);
    this.settings.delete(weddingId);
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

export const fakeSiteTexts: SiteTexts = {
  sectionTitles: {
    "our-story": "Unsere Geschichte",
    schedule: "Tagesablauf",
    travel: "Anreise",
    "things-to-do": "Empfehlungen",
    registry: "Geschenkideen",
    "wedding-party": "Hochzeitsgesellschaft",
    gallery: "Galerie",
    faqs: "Häufige Fragen",
  },
  newSectionTitle: "Neuer Abschnitt",
};

export const fakeCardTexts: CardTexts = {
  labels: {
    locale: "de",
    eyebrow: { saveTheDate: "Save the Date", invitation: "Einladung", thankYou: "Danke", engagement: "Verlobung" },
    replyBy: "Bitte antwortet bis {date}",
    time: "{time} Uhr",
    dateTbd: "Datum folgt",
  },
  defaults: {
    saveTheDate: { heading: "Haltet euch den Tag frei", text: "Einladung folgt", message: "Hallo {name}, merkt euch den Tag!" },
    invitation: { heading: "Wir heiraten", text: "Feiert mit uns", message: "Hallo {name}, hier ist eure Einladung." },
    thankYou: { heading: "Danke", text: "Es war wunderschön.", message: "Hallo {name}, danke!" },
    engagement: { heading: "Wir haben uns verlobt", text: "", message: "Wir haben uns verlobt!" },
  },
  reminderMessage: "Hallo {name}, denkt an eure Antwort.",
  sampleHousehold: "Familie Beispiel",
  calendarTitle: "Hochzeit von {couple}",
  firstVersionLabel: "Standard",
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

const emptyDelivery = (): Omit<Delivery, "openedAt"> => ({
  excluded: false,
  sharedAt: null,
  sharedVia: null,
  emailQueuedAt: null,
  emailedAt: null,
  emailError: null,
  reminderOffset: null,
  reminderQueuedAt: null,
  remindedAt: null,
  reminderError: null,
});

type FakeDelivery = DeliveryRecord & { emailClaimedAt: Date | null; reminderClaimedAt: Date | null };

export class InMemoryCards implements CardRepository {
  cards: Card[] = [];
  deliveries: FakeDelivery[] = [];
  opens: OpenRecord[] = [];
  private n = 0;
  constructor(private guests: InMemoryGuests) {}

  /** Deliveries and opens go with their household and card (ON DELETE CASCADE). */
  private live() {
    const household = (id: string) => this.guests.households.some((h) => h.id === id);
    this.deliveries = this.deliveries.filter((d) => household(d.householdId));
    this.opens = this.opens.filter((o) => household(o.householdId) && this.cards.some((c) => c.id === o.cardId));
    return this.deliveries;
  }
  private weddingOf = (householdId: string) => this.guests.households.find((h) => h.id === householdId)?.weddingId;
  private row(householdId: string, kind: HouseholdCardKind): FakeDelivery {
    let d = this.live().find((x) => x.householdId === householdId && x.kind === kind);
    if (!d) {
      d = { ...emptyDelivery(), householdId, kind, emailClaimedAt: null, reminderClaimedAt: null };
      this.deliveries.push(d);
    }
    return d;
  }
  private plain = (d: FakeDelivery): DeliveryRecord => omit(omit(copy(d), "emailClaimedAt"), "reminderClaimedAt");

  async create(card: NewCard) {
    const created: Card = { ...copy(card), id: `card-${++this.n}`, sharedAt: null, createdAt: new Date(), updatedAt: new Date() };
    this.cards.push(created);
    return copy(created);
  }
  async findById(cardId: string) {
    return copy(this.cards.find((c) => c.id === cardId) ?? null);
  }
  async listByWedding(weddingId: string) {
    return copy(this.cards.filter((c) => c.weddingId === weddingId).sort((a, b) => a.position - b.position));
  }
  async update(cardId: string, input: CardInput) {
    const card = this.cards.find((c) => c.id === cardId);
    if (card) Object.assign(card, copy(input), { updatedAt: new Date() });
  }
  async rename(cardId: string, label: string) {
    const card = this.cards.find((c) => c.id === cardId);
    if (card) card.label = label;
  }
  async delete(cardId: string) {
    this.cards = this.cards.filter((c) => c.id !== cardId);
  }
  async markLinkShared(cardId: string, at: Date) {
    const card = this.cards.find((c) => c.id === cardId);
    if (card) card.sharedAt ??= at;
  }
  async listDeliveries(weddingId: string) {
    return this.live().filter((d) => this.weddingOf(d.householdId) === weddingId).map(this.plain);
  }
  async listDeliveriesOfHousehold(householdId: string) {
    return this.live().filter((d) => d.householdId === householdId).map(this.plain);
  }
  async setExcluded(householdId: string, kind: HouseholdCardKind, excluded: boolean) {
    this.row(householdId, kind).excluded = excluded;
  }
  async markShared(householdId: string, kind: HouseholdCardKind, via: SharedVia, at: Date) {
    const d = this.row(householdId, kind);
    if (d.sharedAt) return;
    d.sharedAt = at;
    d.sharedVia = via;
  }
  async unmarkShared(householdId: string, kind: HouseholdCardKind) {
    const d = this.live().find((x) => x.householdId === householdId && x.kind === kind);
    if (!d || d.sharedVia !== "manual") return false;
    d.sharedAt = null;
    d.sharedVia = null;
    return true;
  }
  async listOpens(weddingId: string) {
    this.live();
    return copy(this.opens.filter((o) => this.cards.find((c) => c.id === o.cardId)?.weddingId === weddingId));
  }
  async listOpensOfHousehold(householdId: string) {
    this.live();
    return copy(this.opens.filter((o) => o.householdId === householdId));
  }
  async markOpened(cardId: string, householdId: string, at: Date) {
    this.live();
    if (this.opens.some((o) => o.cardId === cardId && o.householdId === householdId)) return false;
    this.opens.push({ cardId, householdId, openedAt: at });
    return true;
  }
  private fields(channel: MailChannel) {
    return channel === "card"
      ? ({ queued: "emailQueuedAt", claimed: "emailClaimedAt", sent: "emailedAt", error: "emailError" } as const)
      : ({ queued: "reminderQueuedAt", claimed: "reminderClaimedAt", sent: "remindedAt", error: "reminderError" } as const);
  }
  async queueMail(channel: MailChannel, kind: HouseholdCardKind, householdIds: string[], at: Date) {
    const f = this.fields(channel);
    let queued = 0;
    for (const id of householdIds) {
      const d = this.row(id, kind);
      if (d[f.claimed]) continue;
      d[f.queued] = at;
      d[f.error] = null;
      queued++;
    }
    return queued;
  }
  async listQueuedMail(limit: number, weddingId?: string): Promise<QueuedMail[]> {
    const result: QueuedMail[] = [];
    for (const d of this.live()) {
      const wedding = this.weddingOf(d.householdId)!;
      if (weddingId && wedding !== weddingId) continue;
      if (d.emailQueuedAt && !d.emailClaimedAt) result.push({ householdId: d.householdId, kind: d.kind, weddingId: wedding, channel: "card" });
      if (d.reminderQueuedAt && !d.reminderClaimedAt) result.push({ householdId: d.householdId, kind: d.kind, weddingId: wedding, channel: "reminder" });
    }
    return result.slice(0, limit);
  }
  async claimMail(channel: MailChannel, householdId: string, kind: HouseholdCardKind, at: Date) {
    const f = this.fields(channel);
    const d = this.live().find((x) => x.householdId === householdId && x.kind === kind);
    if (!d || !d[f.queued] || d[f.claimed]) return false;
    d[f.claimed] = at;
    return true;
  }
  async finishMail(channel: MailChannel, householdId: string, kind: HouseholdCardKind, outcome: { sentAt: Date } | { error: string }) {
    const f = this.fields(channel);
    const d = this.live().find((x) => x.householdId === householdId && x.kind === kind);
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
  async claimAutomaticReminder(householdId: string, offset: number, at: Date) {
    const d = this.row(householdId, "invitation");
    if (d.reminderOffset !== null && d.reminderOffset <= offset) return false;
    d.reminderOffset = offset;
    d.remindedAt = at;
    return true;
  }
  async listWeddingIdsWithReminders() {
    return [...new Set(this.cards.filter((c) => c.kind === "invitation" && c.reminderDays.length > 0).map((c) => c.weddingId))];
  }
  dropWedding(weddingId: string) {
    this.cards = this.cards.filter((c) => c.weddingId !== weddingId);
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

export const fakeInvitationMail: InvitationMailTemplate = {
  render: ({ link, inviter, weddingTitle, role }) => ({
    subject: `Invitation to ${weddingTitle}`,
    text: `${inviter} invites you to ${weddingTitle} as ${role}: ${link}`,
    html: `<a href="${link}">join</a>`,
  }),
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
  const users = new InMemoryUsers();
  const websites = new InMemoryWebsites();
  const weddings = new InMemoryWeddings(websites, users);
  users.setContact = async (weddingId, userId) => {
    await weddings.update(weddingId, { contactUserId: userId });
  };
  users.deleteWeddings = async (ids) => {
    for (const id of ids) await weddings.delete(id);
  };
  const billingRepo = new InMemoryBilling(weddings);
  const guests = new InMemoryGuests();
  const cards = new InMemoryCards(guests);
  const uploads = new InMemoryUploads();
  const invitations = new InMemoryInvitations();
  guests.versionExists = (id) => cards.cards.some((c) => c.id === id) || websites.websites.some((w) => w.id === id);
  weddings.cascades.push(
    (id) => guests.dropWedding(id),
    (id) => cards.dropWedding(id),
    (id) => (uploads.uploads = uploads.uploads.filter((u) => u.weddingId !== id)),
    (id) => (billingRepo.entitlements = billingRepo.entitlements.filter((e) => e.weddingId !== id)),
    (id) => (invitations.invitations = invitations.invitations.filter((i) => i.weddingId !== id)),
  );
  const fakes = {
    users,
    magicLinks: new InMemoryMagicLinks(),
    sessions: new InMemorySessions(),
    rateLimiter: new InMemoryRateLimiter(),
    weddings,
    invitations,
    websites,
    uploads,
    storage: new InMemoryStorage(),
    images: new FakeImageProcessor(),
    mailer: new FakeMailer(),
    mailTemplate: fakeMailTemplate,
    invitationMail: fakeInvitationMail,
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
    spreadsheets: new FakeSpreadsheets(),
    guests,
    guestLinks: fakeGuestLinks,
    guestMail: fakeGuestMail,
    cards,
    cardRenderer: new FakeCardRenderer(),
    cardMail: fakeCardMail,
    cardTexts: fakeCardTexts,
    siteTexts: fakeSiteTexts,
    mailRate: { batchSize: 50, intervalMs: 0 },
    appUrl: "http://localhost:3000",
  };
  fakes.users.cascades.push((userId) => {
    // As in the database: memberships go, weddings and their photos stay; references to the user become null.
    weddings.members = weddings.members.filter((m) => m.userId !== userId);
    for (const w of weddings.weddings) if (w.contactUserId === userId) w.contactUserId = null;
    for (const u of uploads.uploads) if (u.uploadedBy === userId) u.uploadedBy = null;
    for (const e of billingRepo.entitlements) if (e.purchasedBy === userId) e.purchasedBy = null;
    invitations.invitations = invitations.invitations.map((i) => (i.invitedBy === userId ? { ...i, invitedBy: null } : i));
    fakes.sessions.sessions = fakes.sessions.sessions.filter((s) => s.userId !== userId);
  });
  const deps: Deps = fakes;
  return { ...fakes, deps };
}

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
