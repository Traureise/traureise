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

    // Every membership is listed; the data and photos (whoever uploaded them) of the weddings the user administers.
    // An editor's weddings belong to their admins, who export them.
    const memberOf = await weddings.listForMember(userId);
    const administered = memberOf.filter((w) => w.role === "admin");
    const files: ArchiveEntry[] = [];
    const fileList: { path: string; weddingId: string | null; contentType: string }[] = [];
    for (const wedding of administered) {
      for (const key of await uploads.listKeysByWedding(wedding.id)) {
        const file = await storage.get(key);
        if (!file) continue;
        files.push({ path: imagePath(key), bytes: file.bytes });
        fileList.push({ path: imagePath(key), weddingId: wedding.id, contentType: file.contentType });
      }
    }

    const image = (key: string | null) => (key ? imagePath(key) : null);
    const sectionsOf = async (websiteId: string) => {
      const [sections, blocks] = await Promise.all([websites.listSections(websiteId), websites.listBlocks(websiteId)]);
      return sections.map((s) => ({ ...s, blocks: blocks.filter((b) => b.sectionId === s.id).map(({ id, position, data }) => ({ id, position, data })) }));
    };
    const exported = [];
    for (const wedding of administered) {
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
      const { id, slug, title, weddingDate, location, latitude, longitude, timezone, lastOpenedAt, createdAt, updatedAt } = wedding;
      exported.push({
        id,
        slug,
        title,
        weddingDate,
        location,
        latitude,
        longitude,
        timezone,
        lastOpenedAt,
        createdAt,
        updatedAt,
        events: (await weddings.listEvents(wedding.id)).map(({ id, data }) => ({ id, data })),
        websites: await Promise.all(
          sites.map(async (site) => ({
            id: site.id,
            label: site.label,
            position: site.position,
            slug: site.slug,
            published: site.published,
            welcomeMessage: site.welcomeMessage,
            hashtag: site.hashtag,
            showCountdown: site.showCountdown,
            themeId: site.themeId,
            paletteId: site.paletteId,
            fontPairingId: site.fontPairingId,
            coverImage: image(site.coverImageKey),
            createdAt: site.createdAt,
            updatedAt: site.updatedAt,
            sections: await sectionsOf(site.id),
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
      memberships: memberOf.map((w) => ({ weddingId: w.id, title: w.title, role: w.role })),
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

/** The weddings the user is the only admin of while others are members: deleting the account would orphan them. */
export class WeddingsBlockingDeletion {
  constructor(private deps: Deps) {}

  async execute(userId: string): Promise<{ id: string; title: string }[]> {
    const blocking: { id: string; title: string }[] = [];
    for (const wedding of await this.deps.weddings.listForMember(userId)) {
      if (wedding.role !== "admin") continue;
      const others = (await this.deps.weddings.listMembers(wedding.id)).filter((m) => m.userId !== userId);
      if (others.length > 0 && !others.some((m) => m.role === "admin")) blocking.push({ id: wedding.id, title: wedding.title });
    }
    return blocking;
  }
}

/**
 * DSGVO Art. 17: removes the account with its sessions and login traces, and the weddings no one else is a member
 * of with every row and file in them. Weddings shared with others stay; while the user is their last admin, the
 * deletion is refused (they first hand the wedding over or delete it).
 */
export class DeleteAccount {
  constructor(private deps: Deps) {}

  async execute(userId: string, confirmEmail: string): Promise<void> {
    const { users, weddings, uploads, storage, magicLinks, rateLimiter } = this.deps;
    const user = await users.findById(userId);
    if (!user) throw new NotFoundError();
    if (normalizeEmail(confirmEmail) !== user.email) throw new ValidationError({ email: "email_mismatch" });

    const blocking = await new WeddingsBlockingDeletion(this.deps).execute(userId);
    if (blocking.length > 0) throw new ValidationError({ _: "last_admin", weddings: blocking.map((w) => w.title).join(", ") });

    // Everything is worked out first; the rows go in one transaction, the files only after it, so a failing file
    // delete never leaves a half-deleted account (at worst an orphaned file). Files of other weddings stay.
    const soleWeddings: string[] = [];
    const keys: string[] = [];
    for (const wedding of await weddings.listForMember(userId)) {
      const members = await weddings.listMembers(wedding.id);
      if (members.some((m) => m.userId !== userId)) continue;
      soleWeddings.push(wedding.id);
      keys.push(...(await uploads.listKeysByWedding(wedding.id)));
    }
    await users.delete(userId, soleWeddings);
    await magicLinks.deleteByEmail(user.email);
    await rateLimiter.forget(`magic-link:email:${user.email}`);
    for (const key of keys) await storage.delete(key);
  }
}
