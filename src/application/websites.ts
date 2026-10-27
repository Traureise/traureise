import { findFontPairing } from "@/domain/fonts";
import { parseHome } from "@/domain/website";
import type { Deps } from "./deps";
import { ValidationError } from "./errors";
import { loadGuestContext } from "./guest-context";
import { assertOwnImage, loadWebsite, releaseImages } from "./owned";
import type { Website } from "./ports";
import { assertSlugAvailable } from "./slugs";
import { loadView, type WebsiteView } from "./views";

export type WebsiteEditorView = WebsiteView & {
  /** The wedding's website versions, first first, for the switcher. */
  versions: { id: string; label: string }[];
  /** Published and allowed (an extra version without a paid package is offline). */
  online: boolean;
  publicUrl: string;
  /** "+ Version" is unlocked (canUse). */
  canAddVersion: boolean;
};

export class GetWebsiteForOwner {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string): Promise<WebsiteEditorView> {
    const { wedding, website } = await loadWebsite(this.deps, userId, websiteId);
    const ctx = await loadGuestContext(this.deps, wedding);
    return {
      ...(await loadView(this.deps, wedding, website)),
      versions: ctx.websites.map(({ id, label }) => ({ id, label })),
      online: ctx.online(website),
      publicUrl: `${this.deps.appUrl}/${website.slug}`,
      canAddVersion: ctx.can("websiteVersions"),
    };
  }
}

export class UpdateHome {
  constructor(private deps: Deps) {}

  /** Welcome text, hashtag and countdown of one website version. */
  async execute(userId: string, websiteId: string, input: unknown): Promise<Website> {
    await loadWebsite(this.deps, userId, websiteId);
    const parsed = parseHome(input);
    if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
    return this.deps.websites.update(websiteId, parsed.value);
  }
}

export class UpdateSlug {
  constructor(private deps: Deps) {}

  /** A website version's own address; the wedding's links and the other versions keep theirs. */
  async execute(userId: string, websiteId: string, slug: string): Promise<Website> {
    const { website, wedding } = await loadWebsite(this.deps, userId, websiteId);
    const normalized = slug.trim();
    if (normalized === website.slug) return website;
    await assertSlugAvailable(this.deps, normalized, { wedding: wedding.id, website: websiteId });
    return this.deps.websites.update(websiteId, { slug: normalized });
  }
}

export class SetPublished {
  constructor(private deps: Deps) {}

  /** A version is a draft (a 404 publicly) until the couple publishes it; it can be taken offline again. */
  async execute(userId: string, websiteId: string, published: boolean): Promise<void> {
    await loadWebsite(this.deps, userId, websiteId);
    await this.deps.websites.update(websiteId, { published });
  }
}

export class SetCoverImage {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, imageKey: string | null): Promise<void> {
    const { website, wedding } = await loadWebsite(this.deps, userId, websiteId);
    await assertOwnImage(this.deps, wedding.id, imageKey, "coverImageKey");
    await this.deps.websites.update(websiteId, { coverImageKey: imageKey });
    if (website.coverImageKey !== imageKey) await releaseImages(this.deps, wedding.id, [website.coverImageKey]);
  }
}

export class SelectTheme {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, themeId: string): Promise<void> {
    await loadWebsite(this.deps, userId, websiteId);
    if (!this.deps.themes.get(themeId)) throw new ValidationError({ themeId: "unknown_theme" });
    await this.deps.websites.update(websiteId, { themeId, paletteId: null, fontPairingId: null });
  }
}

export class UpdateDesign {
  constructor(private deps: Deps) {}

  async execute(userId: string, websiteId: string, input: { paletteId: string | null; fontPairingId: string | null }): Promise<void> {
    const { website } = await loadWebsite(this.deps, userId, websiteId);
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
