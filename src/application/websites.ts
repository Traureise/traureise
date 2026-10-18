import { z } from "zod";
import { findFontPairing } from "@/domain/fonts";
import { isoDate, optional, requiredText } from "@/domain/fields";
import { parseWith } from "@/domain/result";
import { SECTION_KINDS } from "@/domain/sections";
import { slugify, validateSlug } from "@/domain/slug";
import { DEFAULT_TIMEZONE, parseHome } from "@/domain/website";
import type { Deps } from "./deps";
import { ValidationError } from "./errors";
import { assertOwnImage, deleteImage, loadOwnedWebsite } from "./owned";
import type { Website } from "./ports";
import { loadView, type WebsiteView } from "./views";

const createSchema = z.object({
  title: requiredText(120),
  weddingDate: optional(isoDate).default(null),
  slug: optional(z.string().trim()).default(null),
  themeId: optional(z.string()).default(null),
});

async function assertSlugAvailable(deps: Deps, slug: string, exceptWebsiteId?: string) {
  const error = validateSlug(slug);
  if (error) throw new ValidationError({ slug: error });
  if (await deps.websites.slugTaken(slug, exceptWebsiteId)) throw new ValidationError({ slug: "taken" });
}

async function uniqueSlug(deps: Deps, base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = base.slice(0, 60 - suffix.length).replace(/-+$/, "") + suffix;
    if (!validateSlug(candidate) && !(await deps.websites.slugTaken(candidate))) return candidate;
  }
}

export class CreateWebsite {
  constructor(private deps: Deps) {}

  async execute(ownerId: string, input: { title: string; weddingDate?: string; slug?: string; themeId?: string }): Promise<Website> {
    const parsed = parseWith(createSchema, input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    const { title, weddingDate, slug, themeId } = parsed.value;

    if (themeId && !this.deps.themes.get(themeId)) throw new ValidationError({ themeId: "unknown_theme" });
    if (slug) await assertSlugAvailable(this.deps, slug);

    return this.deps.websites.create(
      {
        ownerId,
        title,
        weddingDate,
        slug: slug ?? (await uniqueSlug(this.deps, slugify(title))),
        themeId: themeId ?? this.deps.themes.defaultThemeId(),
        timezone: DEFAULT_TIMEZONE,
      },
      SECTION_KINDS.map((kind) => ({ kind, title: null, visible: true, body: "" })),
    );
  }
}

export class ListWebsites {
  constructor(private deps: Deps) {}

  execute(ownerId: string): Promise<Website[]> {
    return this.deps.websites.listByOwner(ownerId);
  }
}

export class GetWebsiteForOwner {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string): Promise<WebsiteView> {
    return loadView(this.deps, await loadOwnedWebsite(this.deps, userId, websiteId));
  }
}

export class UpdateHome {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, input: unknown): Promise<Website> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    const parsed = parseHome(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    return this.deps.websites.update(websiteId, parsed.value);
  }
}

export class UpdateSlug {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, slug: string): Promise<Website> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const normalized = slug.trim();
    if (normalized === website.slug) return website;
    await assertSlugAvailable(this.deps, normalized, websiteId);
    return this.deps.websites.update(websiteId, { slug: normalized });
  }
}

export class SetCoverImage {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, imageKey: string | null): Promise<void> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    await assertOwnImage(this.deps, websiteId, imageKey, "coverImageKey");
    await this.deps.websites.update(websiteId, { coverImageKey: imageKey });
    if (website.coverImageKey && website.coverImageKey !== imageKey) await deleteImage(this.deps, website.coverImageKey);
  }
}

export class SelectTheme {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, themeId: string): Promise<void> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    if (!this.deps.themes.get(themeId)) throw new ValidationError({ themeId: "unknown_theme" });
    await this.deps.websites.update(websiteId, { themeId, paletteId: null, fontPairingId: null });
  }
}

export class UpdateDesign {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, input: { paletteId: string | null; fontPairingId: string | null }): Promise<void> {
    const website = await loadOwnedWebsite(this.deps, userId, websiteId);
    const theme = this.deps.themes.get(website.themeId);
    if (input.paletteId && !theme?.palettes.some((p) => p.id === input.paletteId)) {
      throw new ValidationError({ paletteId: "unknown_palette" });
    }
    if (input.fontPairingId && !findFontPairing(input.fontPairingId)) {
      throw new ValidationError({ fontPairingId: "unknown_font_pairing" });
    }
    await this.deps.websites.update(websiteId, { paletteId: input.paletteId, fontPairingId: input.fontPairingId });
  }
}

export class DeleteWebsite {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string): Promise<void> {
    await loadOwnedWebsite(this.deps, userId, websiteId);
    const keys = await this.deps.uploads.listKeysByWebsite(websiteId);
    await this.deps.websites.delete(websiteId);
    for (const key of keys) await deleteImage(this.deps, key);
  }
}
