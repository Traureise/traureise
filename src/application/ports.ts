import type { CollectionKind, ItemData, SectionKind } from "@/domain/sections";
import type { ThemeManifest } from "@/domain/theme";

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
  paletteId: string | null;
  fontPairingId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewWebsite = Pick<Website, "ownerId" | "slug" | "title" | "weddingDate" | "themeId" | "timezone">;
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
}

export type MagicLinkRecord = { id: string; email: string; expiresAt: Date; usedAt: Date | null };

export interface MagicLinkRepository {
  create(input: { email: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findByHash(tokenHash: string): Promise<MagicLinkRecord | null>;
  /** Marks the token used; returns false if it was already used (single use, race-safe). */
  markUsed(id: string, at: Date): Promise<boolean>;
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

export interface UploadRepository {
  create(input: { key: string; ownerId: string; websiteId: string; contentType: string; size: number }): Promise<void>;
  belongsToWebsite(key: string, websiteId: string): Promise<boolean>;
  listKeysByWebsite(websiteId: string): Promise<string[]>;
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

export type MailMessage = { to: string; subject: string; text: string; html: string };

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
