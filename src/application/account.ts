import { normalizeEmail } from "@/domain/email";
import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import type { ArchiveEntry } from "./ports";

const imagePath = (key: string) => `images/${key}`;

/** DSGVO Art. 15 and 20: everything stored about a user, as data.json plus the original images. */
export class ExportAccount {
  constructor(private deps: Deps) {}

  async execute(userId: string): Promise<{ filename: string; bytes: Uint8Array }> {
    const { users, websites, uploads, storage, billingRepo, guests, cards, archive, clock } = this.deps;
    const user = await users.findById(userId);
    if (!user) throw new NotFoundError();
    const now = clock.now();

    const files: ArchiveEntry[] = [];
    const fileList: { path: string; websiteId: string | null; contentType: string }[] = [];
    for (const upload of await uploads.listByOwner(userId)) {
      const file = await storage.get(upload.key);
      if (!file) continue;
      files.push({ path: imagePath(upload.key), bytes: file.bytes });
      fileList.push({ path: imagePath(upload.key), websiteId: upload.websiteId, contentType: upload.contentType });
    }

    const exported = [];
    for (const website of await websites.listByOwner(userId)) {
      const households = await guests.listHouseholds(website.id);
      const { id, slug, title, weddingDate, location, welcomeMessage, hashtag, showCountdown, timezone, themeId, siteEnabled, paletteId, fontPairingId } = website;
      exported.push({
        id,
        slug,
        title,
        weddingDate,
        location,
        welcomeMessage,
        hashtag,
        showCountdown,
        timezone,
        themeId,
        siteEnabled,
        paletteId,
        fontPairingId,
        createdAt: website.createdAt,
        updatedAt: website.updatedAt,
        coverImage: website.coverImageKey ? imagePath(website.coverImageKey) : null,
        sections: await websites.listSections(website.id),
        items: (await websites.listItems(website.id)).map(({ id, kind, position, data }) => ({ id, kind, position, data })),
        purchases: (await billingRepo.listByWebsite(website.id)).map(({ tier, purchaseRef, provider, validUntil, revokedAt, createdAt }) => ({
          tier,
          purchaseRef,
          provider,
          validUntil,
          revokedAt,
          createdAt,
        })),
        guests: {
          settings: await guests.getSettings(website.id),
          polls: await guests.listPolls(website.id),
          households,
        },
        cards: await Promise.all(
          (await cards.listByWebsite(website.id)).map(async (card) => ({
            kind: card.kind,
            themeId: card.themeId,
            paletteId: card.paletteId,
            fontPairingId: card.fontPairingId,
            layoutId: card.layoutId,
            envelope: card.envelope,
            content: card.content,
            message: card.message,
            reminderDays: card.reminderDays,
            reminderMessage: card.reminderMessage,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
            photo: card.photoKey ? imagePath(card.photoKey) : null,
            // Sent and opened status per household (v4); the households themselves are under guests.
            deliveries: (await cards.listDeliveries(card.id)).map((d) => ({
              household: households.find((h) => h.id === d.householdId)?.name ?? null,
              householdId: d.householdId,
              excluded: d.excluded,
              sharedAt: d.sharedAt,
              sharedVia: d.sharedVia,
              emailedAt: d.emailedAt,
              emailQueuedAt: d.emailQueuedAt,
              emailError: d.emailError,
              openedAt: d.openedAt,
              remindedAt: d.remindedAt,
              reminderOffset: d.reminderOffset,
              reminderError: d.reminderError,
            })),
          })),
        ),
      });
    }

    const data = {
      exportedAt: now.toISOString(),
      account: { email: user.email, firstName: user.firstName, createdAt: user.createdAt },
      websites: exported,
      files: fileList,
    };
    const json = new TextEncoder().encode(JSON.stringify(data, null, 2));
    return {
      filename: `traureise-export-${now.toISOString().slice(0, 10)}.zip`,
      bytes: await archive.zip([{ path: "data.json", bytes: json }, ...files]),
    };
  }
}

/** DSGVO Art. 17: removes the account with every row, file, session and login trace. */
export class DeleteAccount {
  constructor(private deps: Deps) {}

  async execute(userId: string, confirmEmail: string): Promise<void> {
    const { users, uploads, storage, magicLinks, rateLimiter } = this.deps;
    const user = await users.findById(userId);
    if (!user) throw new NotFoundError();
    if (normalizeEmail(confirmEmail) !== user.email) throw new ValidationError({ email: "email_mismatch" });

    const keys = (await uploads.listByOwner(userId)).map((u) => u.key);
    // Rows first (one delete, the cascades do the rest), so a failing file delete never leaves a half-deleted account.
    await users.delete(userId);
    for (const key of keys) await storage.delete(key);
    await magicLinks.deleteByEmail(user.email);
    await rateLimiter.forget(`magic-link:email:${user.email}`);
  }
}
