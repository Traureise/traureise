import { normalizeEmail } from "@/domain/email";
import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import type { ArchiveEntry } from "./ports";

const imagePath = (key: string) => `images/${key}`;

/** DSGVO Art. 15 and 20: everything stored about a user, as data.json plus the original images. */
export class ExportAccount {
  constructor(private deps: Deps) {}

  async execute(userId: string): Promise<{ filename: string; bytes: Uint8Array }> {
    const { users, weddings, websites, uploads, storage, billingRepo, guests, cards, archive, clock } = this.deps;
    const user = await users.findById(userId);
    if (!user) throw new NotFoundError();
    const now = clock.now();

    const files: ArchiveEntry[] = [];
    const fileList: { path: string; weddingId: string | null; contentType: string }[] = [];
    for (const upload of await uploads.listByOwner(userId)) {
      const file = await storage.get(upload.key);
      if (!file) continue;
      files.push({ path: imagePath(upload.key), bytes: file.bytes });
      fileList.push({ path: imagePath(upload.key), weddingId: upload.weddingId, contentType: upload.contentType });
    }

    const image = (key: string | null) => (key ? imagePath(key) : null);
    const exported = [];
    for (const wedding of await weddings.listByOwner(userId)) {
      const [households, weddingCards, sites, deliveries, opens, assignments] = await Promise.all([
        guests.listHouseholds(wedding.id),
        cards.listByWedding(wedding.id),
        websites.listByWedding(wedding.id),
        cards.listDeliveries(wedding.id),
        cards.listOpens(wedding.id),
        guests.listAssignments(wedding.id),
      ]);
      const householdName = (id: string) => households.find((h) => h.id === id)?.name ?? null;
      const versionLabel = (id: string) => weddingCards.find((c) => c.id === id)?.label ?? sites.find((w) => w.id === id)?.label ?? null;
      const { id, slug, title, weddingDate, location, timezone, lastOpenedAt, createdAt, updatedAt } = wedding;
      exported.push({
        id,
        slug,
        title,
        weddingDate,
        location,
        timezone,
        lastOpenedAt,
        createdAt,
        updatedAt,
        events: (await weddings.listEvents(wedding.id)).map(({ id, position, data }) => ({ id, position, data })),
        websites: await Promise.all(
          sites.map(async (site) => ({
            id: site.id,
            label: site.label,
            position: site.position,
            slug: site.slug,
            published: site.published,
            hiddenEventIds: site.hiddenEventIds,
            welcomeMessage: site.welcomeMessage,
            hashtag: site.hashtag,
            showCountdown: site.showCountdown,
            themeId: site.themeId,
            paletteId: site.paletteId,
            fontPairingId: site.fontPairingId,
            coverImage: image(site.coverImageKey),
            createdAt: site.createdAt,
            updatedAt: site.updatedAt,
            sections: await websites.listSections(site.id),
            items: (await websites.listItems(site.id)).map(({ id, kind, position, data }) => ({ id, kind, position, data })),
          })),
        ),
        purchases: (await billingRepo.listByWedding(wedding.id)).map(({ tier, purchaseRef, provider, validUntil, revokedAt, createdAt }) => ({
          tier,
          purchaseRef,
          provider,
          validUntil,
          revokedAt,
          createdAt,
        })),
        guests: {
          settings: await guests.getSettings(wedding.id),
          polls: await guests.listPolls(wedding.id),
          households,
          // Which version of each item a household gets (none listed: the first).
          versions: assignments.map((a) => ({ household: householdName(a.householdId), householdId: a.householdId, item: a.item, versionId: a.versionId, version: versionLabel(a.versionId) })),
        },
        cards: weddingCards.map((card) => ({
          id: card.id,
          kind: card.kind,
          label: card.label,
          slug: card.slug,
          position: card.position,
          sharedAt: card.sharedAt,
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
          photo: image(card.photoKey),
        })),
        // Sent status per household and kind of card, and when each household first opened a version (v4).
        deliveries: deliveries.map((d) => ({
          household: householdName(d.householdId),
          householdId: d.householdId,
          kind: d.kind,
          excluded: d.excluded,
          sharedAt: d.sharedAt,
          sharedVia: d.sharedVia,
          emailedAt: d.emailedAt,
          emailQueuedAt: d.emailQueuedAt,
          emailError: d.emailError,
          remindedAt: d.remindedAt,
          reminderOffset: d.reminderOffset,
          reminderError: d.reminderError,
        })),
        opens: opens.map((o) => ({ household: householdName(o.householdId), householdId: o.householdId, cardId: o.cardId, card: versionLabel(o.cardId), openedAt: o.openedAt })),
      });
    }

    const data = {
      exportedAt: now.toISOString(),
      account: { email: user.email, firstName: user.firstName, createdAt: user.createdAt },
      weddings: exported,
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
