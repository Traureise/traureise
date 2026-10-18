import { createHash, randomUUID } from "node:crypto";
import type {
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
  ImageProcessor,
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
import { parseThemeManifest, type ThemeManifest } from "@/domain/theme";

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

export class InMemoryWebsites implements WebsiteRepository {
  websites: Website[] = [];
  sections = new Map<string, Section[]>();
  items: (Item & { websiteId: string })[] = [];

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

export const fakeMailTemplate: MagicLinkMailTemplate = {
  render: (link, minutes) => ({ subject: "Login", text: `${link} (${minutes})`, html: `<a href="${link}">login</a>` }),
};

const palette = (id: string) => ({
  id,
  name: { de: id },
  colors: { background: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#555555", primary: "#336699", accent: "#cc9933" },
});

export function themeFixture(id: string, paletteIds = ["hell", "dunkel"]): ThemeManifest {
  const parsed = parseThemeManifest(
    {
      id,
      name: { de: id },
      category: { de: "Test" },
      palettes: paletteIds.map(palette),
      fonts: { defaultPairing: "klassisch" },
      assets: { preview: "preview.svg" },
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
}

export function createFakes() {
  const websites = new InMemoryWebsites();
  const billingRepo = new InMemoryBilling(websites);
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
        { tier: "invitations" as const, priceCents: 13900, productId: "prod_inv" },
        { tier: "complete" as const, priceCents: 14900, productId: "prod_all" },
      ],
      unlockedTiers: ["rsvp" as const, "complete" as const],
    },
    billingRepo,
    payments: new FakePayments() as FakePayments | null,
    archive: new FakeArchive(),
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
