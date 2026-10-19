import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import { ExportAccount } from "@/application/account";
import { ExportCard, MarkCardsOpened, RunMailJobs, SendCardEmails, ShareCard, Unsubscribe } from "@/application/cards";
import type { Deps } from "@/application/deps";
import type { Card } from "@/application/ports";
import { AddVersion, AssignVersion } from "@/application/versions";
import { CreateWedding } from "@/application/weddings";
import { buildCardModel, defaultCardContent, type CardKind } from "@/domain/cards";
import { cardLayoutsFor, resolveDesign } from "@/domain/theme";
import { FflateArchiveWriter } from "@/infrastructure/archive/zip";
import { SatoriCardRenderer } from "@/infrastructure/cards/renderer";
import { cardDeliveries, cardOpens, cards, householdVersions, households } from "@/infrastructure/db/schema";
import { createCardMailTemplates, createCardTexts } from "@/infrastructure/mail/card-templates";
import { SmtpMailer } from "@/infrastructure/mail/smtp";
import { DrizzleBillingRepository } from "@/infrastructure/repositories/billing";
import { DrizzleCardRepository } from "@/infrastructure/repositories/cards";
import { DrizzleGuestRepository } from "@/infrastructure/repositories/guests";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { DrizzleWeddingRepository } from "@/infrastructure/repositories/weddings";
import { cryptoTokens, hmacGuestLinks } from "@/infrastructure/system";
import { FsThemeCatalog } from "@/infrastructure/themes/fs-catalog";
import { FakeArchive, FakeClock, FakeMailer, InMemoryStorage } from "../fakes";
import { setupTestDatabase } from "./db";
import { testEnv } from "./env";

const db = setupTestDatabase();
const repo = new DrizzleCardRepository(db);
const guests = new DrizzleGuestRepository(db);
const users = new DrizzleUserRepository(db);
const websites = new DrizzleWebsiteRepository(db);
const weddings = new DrizzleWeddingRepository(db);
const themes = new FsThemeCatalog(path.resolve("themes"));
const renderer = new SatoriCardRenderer(path.resolve("node_modules/@fontsource"));
const guestLinks = hmacGuestLinks("integration-secret-integration-secret");

let weddingId: string;
let ownerId: string;
let email: string;

beforeEach(async () => {
  email = `anna-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`;
  ownerId = (await users.create(email)).id;
  weddingId = (await new CreateWedding(deps()).execute(ownerId, { title: "Anna & Łukasz", hasDate: true, weddingDate: "2027-06-12" })).id;
});

/** Real repositories, renderer and templates; the mailer is real SMTP (Mailpit) when asked. */
function deps(options: { smtp?: boolean } = {}) {
  const { smtpPort } = testEnv();
  const mailer = options.smtp ? new SmtpMailer({ host: "localhost", port: smtpPort, secure: false, from: "Traureise <no-reply@traureise.localhost>" }) : new FakeMailer();
  return {
    users,
    weddings,
    websites,
    uploads: new DrizzleUploadRepository(db),
    storage: new InMemoryStorage(),
    billingRepo: new DrizzleBillingRepository(db),
    guests,
    guestLinks,
    cards: repo,
    cardRenderer: renderer,
    cardMail: createCardMailTemplates(),
    cardTexts: createCardTexts(),
    mailRate: { batchSize: 10, intervalMs: 0 },
    mailer,
    themes,
    clock: new FakeClock(),
    tokens: cryptoTokens,
    archive: new FflateArchiveWriter(),
    billing: { enabled: false, offers: [], unlockedTiers: [] },
    payments: null,
    appUrl: "http://localhost:3000",
  } as unknown as Deps;
}

const household = (name: string, email: string | null = null) =>
  guests.createHousehold(weddingId, { name, invitedEventIds: null, email, personalLine: "", people: [{ id: null, name: "Clara", isChild: false }] }, (id) => guestLinks.hash(guestLinks.tokenFor(id)));

/** The first version of a kind, generated with the wedding. */
async function firstCard(kind: CardKind = "saveTheDate"): Promise<Card> {
  return (await repo.listByWedding(weddingId)).find((c) => c.kind === kind && c.position === 0)!;
}

describe("DrizzleCardRepository", () => {
  it("keeps several versions per wedding and kind, first first, and updates, renames and deletes them", async () => {
    const card = await firstCard();
    const copy = { ...card, id: undefined, sharedAt: undefined, createdAt: undefined, updatedAt: undefined };
    const family = await repo.create({ ...copy, label: "Familie", slug: "familie", position: 1 });
    await expect(repo.create({ ...copy, label: "Doppelt", position: 2 })).rejects.toThrow();
    expect((await repo.listByWedding(weddingId)).filter((c) => c.kind === "saveTheDate").map((c) => c.label)).toEqual(["Standard", "Familie"]);
    await repo.update(family.id, { ...family, content: { ...family.content, text: "Neu" } });
    await repo.rename(family.id, "Verwandte");
    expect(await repo.findById(family.id)).toMatchObject({ label: "Verwandte", slug: "familie", content: { text: "Neu" } });
    await repo.markLinkShared(card.id, new Date("2026-10-18T10:00:00Z"));
    await repo.markLinkShared(card.id, new Date("2026-10-19T10:00:00Z"));
    expect((await repo.findById(card.id))?.sharedAt).toEqual(new Date("2026-10-18T10:00:00Z"));
    await repo.delete(family.id);
    expect(await repo.findById(family.id)).toBeNull();
    expect(await repo.findById("not-a-uuid")).toBeNull();
  });

  it("records the first share per household and kind, and the first opening per version", async () => {
    const card = await firstCard();
    const weber = await household("Weber");
    const first = new Date("2026-10-18T10:00:00Z");
    await repo.markShared(weber.id, "saveTheDate", "whatsapp", first);
    await repo.markShared(weber.id, "saveTheDate", "link", new Date("2026-10-19T10:00:00Z"));
    expect(await repo.markOpened(card.id, weber.id, first)).toBe(true);
    expect(await repo.markOpened(card.id, weber.id, new Date())).toBe(false);
    await repo.setExcluded(weber.id, "saveTheDate", true);
    expect(await repo.listDeliveries(weddingId)).toMatchObject([{ householdId: weber.id, kind: "saveTheDate", sharedVia: "whatsapp", sharedAt: first, excluded: true }]);
    expect(await repo.listOpens(weddingId)).toEqual([{ cardId: card.id, householdId: weber.id, openedAt: first }]);
    expect(await repo.listOpensOfHousehold(weber.id)).toHaveLength(1);
  });

  it("lets exactly one of several instances claim a queued email", async () => {
    const weber = await household("Weber", "weber@example.org");
    const at = new Date();
    expect(await repo.queueMail("card", "saveTheDate", [weber.id], at)).toBe(1);
    expect(await repo.listQueuedMail(10, weddingId)).toEqual([{ householdId: weber.id, kind: "saveTheDate", weddingId, channel: "card" }]);
    const claims = await Promise.all([1, 2, 3, 4].map(() => repo.claimMail("card", weber.id, "saveTheDate", at)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await repo.queueMail("card", "saveTheDate", [weber.id], at)).toBe(0);
    expect(await repo.listQueuedMail(10, weddingId)).toEqual([]);
    await repo.finishMail("card", weber.id, "saveTheDate", { sentAt: at });
    expect(await repo.listDeliveries(weddingId)).toMatchObject([{ emailedAt: at, emailQueuedAt: null, emailError: null }]);
  });

  it("turns stale claims into failures and claims each automatic reminder once", async () => {
    const weber = await household("Weber", "weber@example.org");
    const at = new Date("2026-10-18T10:00:00Z");
    await repo.queueMail("reminder", "invitation", [weber.id], at);
    await repo.claimMail("reminder", weber.id, "invitation", at);
    expect(await repo.failStaleClaims(new Date("2026-10-18T10:20:00Z"))).toBe(1);
    expect(await repo.listDeliveries(weddingId)).toMatchObject([{ reminderError: "interrupted", reminderQueuedAt: null, remindedAt: null }]);

    expect(await repo.claimAutomaticReminder(weber.id, 14, at)).toBe(true);
    expect(await repo.claimAutomaticReminder(weber.id, 14, at)).toBe(false);
    expect(await repo.claimAutomaticReminder(weber.id, 3, at)).toBe(true);
    expect(await repo.listWeddingIdsWithReminders()).toEqual([weddingId]);
  });

  it("stores one version choice per household and item; deleting the version drops the choice", async () => {
    const d = deps();
    const weber = await household("Weber");
    const family = await new AddVersion(d).execute(ownerId, weddingId, "invitation", { label: "Familie", copyFrom: null });
    const [site] = await websites.listByWedding(weddingId);
    await new AssignVersion(d).execute(ownerId, weddingId, weber.id, "invitation", family.id);
    await new AssignVersion(d).execute(ownerId, weddingId, weber.id, "website", site!.id);
    await guests.assign(weber.id, "invitation", { cardId: family.id });
    expect((await guests.listAssignments(weddingId)).sort((a, b) => a.item.localeCompare(b.item))).toEqual([
      { householdId: weber.id, item: "invitation", versionId: family.id },
      { householdId: weber.id, item: "website", versionId: site!.id },
    ]);
    await repo.delete(family.id);
    expect(await guests.listAssignments(weddingId)).toEqual([{ householdId: weber.id, item: "website", versionId: site!.id }]);
  });

  it("drops deliveries, opens and choices with the household (retention), and everything with the wedding", async () => {
    const card = await firstCard();
    const weber = await household("Weber");
    await repo.markShared(weber.id, "saveTheDate", "link", new Date());
    await repo.markOpened(card.id, weber.id, new Date());
    await guests.assign(weber.id, "saveTheDate", { cardId: card.id });
    await guests.deleteGuestData(weddingId);
    expect(await db.select().from(cardDeliveries).where(eq(cardDeliveries.householdId, weber.id))).toEqual([]);
    expect(await db.select().from(cardOpens).where(eq(cardOpens.householdId, weber.id))).toEqual([]);
    expect(await db.select().from(householdVersions).where(eq(householdVersions.householdId, weber.id))).toEqual([]);
    await weddings.delete(weddingId);
    expect(await db.select().from(cards).where(eq(cards.weddingId, weddingId))).toEqual([]);
  });

  it("clears the address on unsubscribe, and a new address ends it", async () => {
    const weber = await household("Weber", "weber@example.org");
    expect(await guests.unsubscribe(weber.id, new Date())).toBe(true);
    const [row] = await db.select().from(households).where(eq(households.id, weber.id));
    expect(row).toMatchObject({ email: null });
    expect(row!.unsubscribedAt).toBeInstanceOf(Date);
    await guests.updateHousehold(weddingId, weber.id, { name: "Weber", invitedEventIds: null, email: "neu@example.org", personalLine: "", people: [] });
    expect((await guests.findHousehold(weddingId, weber.id))?.unsubscribedAt).toBeNull();
  });
});

describe("SatoriCardRenderer", () => {
  const texts = createCardTexts();
  const model = (themeId: string, layoutIndex: number) => {
    const theme = themes.get(themeId)!;
    const layout = cardLayoutsFor(theme, "invitation")[layoutIndex]!;
    return buildCardModel({
      kind: "invitation",
      content: defaultCardContent("invitation", { title: "Anna & Łukasz", location: null }, texts.defaults.invitation),
      design: { ...resolveDesign(theme, null, null), layout },
      website: { title: "Anna & Łukasz", weddingDate: "2027-06-12", location: null },
      event: { startDate: "2027-06-12", startTime: "14:30", venueName: "Gut Kaden" },
      replyBy: "2027-05-01",
      household: null,
      labels: texts.labels,
      assets: { photoSrc: "photo", maskSvg: layout.photoMask ? themes.readSvg(themeId, layout.photoMask) : null, ornamentSvg: layout.ornament ? themes.readSvg(themeId, layout.ornament) : null },
    });
  };
  const photo = sharp({ create: { width: 800, height: 600, channels: 3, background: "#7a9a80" } }).jpeg().toBuffer();

  it("renders every bundled layout as a PNG of the requested width, in A-series proportions", async () => {
    for (const theme of themes.list()) {
      for (const [i] of cardLayoutsFor(theme, "invitation").entries()) {
        const png = await renderer.png(model(theme.id, i), new Uint8Array(await photo), 600);
        const meta = await sharp(png).metadata();
        expect([meta.format, meta.width, meta.height]).toEqual(["png", 600, 849]);
      }
    }
  });

  it("makes one-page PDFs in A6 and A5", async () => {
    for (const [format, [w, h]] of [["a6", [297.6, 419.5]], ["a5", [419.5, 595.3]]] as const) {
      const bytes = await renderer.pdf(model("salbei", 0), new Uint8Array(await photo), format);
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
      const size = doc.getPage(0).getSize();
      expect([Math.round(size.width * 10) / 10, Math.round(size.height * 10) / 10]).toEqual([w, h]);
    }
  });

  it("exports through the use case without a photo", async () => {
    const d = deps();
    const file = await new ExportCard(d).execute(ownerId, (await firstCard()).id, "png");
    expect((await sharp(file.bytes).metadata()).width).toBe(1748);
  });
});

describe("sending cards by email", () => {
  it("delivers one email per household through SMTP, as the couple, with the card inline and the unsubscribe headers", async () => {
    const d = deps({ smtp: true });
    const to = `weber-${Date.now()}@example.org`;
    const weber = await household("Weber", to);
    expect(await new SendCardEmails(d).execute(ownerId, weddingId, "saveTheDate", "all")).toEqual({ queued: 1 });
    // Two instances run the job at the same time: the claim lets only one send.
    const runs = await Promise.all([new RunMailJobs(d).execute({ weddingId }), new RunMailJobs(d).execute({ weddingId })]);
    expect(runs.map((r) => r.sent).sort()).toEqual([0, 1]);

    const { mailpitUrl } = testEnv();
    const search = await (await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    expect(search.messages).toHaveLength(1);
    const message = await (await fetch(`${mailpitUrl}/api/v1/message/${search.messages[0].ID}`)).json();
    expect(message.From).toEqual({ Name: "Anna & Łukasz über Traureise", Address: "no-reply@traureise.localhost" });
    expect(message.ReplyTo).toEqual([{ Name: "", Address: email }]);
    expect(message.Subject).toBe("Save the Date von Anna & Łukasz");
    expect(message.Text).toContain(`http://localhost:3000/antwort/`);
    expect(message.Text).toContain("Keine E-Mails mehr zu dieser Hochzeit: http://localhost:3000/abmelden/");
    expect(message.HTML).toContain('src="cid:karte"');
    expect(message.HTML).not.toMatch(/<img[^>]+src="https?:/);
    expect(message.Inline).toMatchObject([{ ContentType: "image/png", ContentID: "karte" }]);
    const headers = await (await fetch(`${mailpitUrl}/api/v1/message/${search.messages[0].ID}/headers`)).json();
    expect(headers["List-Unsubscribe"]).toEqual([`<http://localhost:3000/api/abmelden/${d.guestLinks.unsubscribeTokenFor(weber.id)}>`]);
    expect(headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);

    expect(await new Unsubscribe(d).execute(d.guestLinks.unsubscribeTokenFor(weber.id))).toBe(true);
    expect(await new Unsubscribe(d).execute(`${weber.id}.forged`)).toBe(false);
  });
});

describe("account export", () => {
  it("contains card versions, addresses, statuses, opens and version choices", async () => {
    const d = deps();
    d.archive = new FakeArchive();
    const weber = await household("Weber", "weber@example.org");
    await new ShareCard(d).execute(ownerId, weddingId, "saveTheDate", weber.id, "link");
    await new MarkCardsOpened(d).execute(guestLinks.tokenFor(weber.id), ["saveTheDate"]);
    await guests.assign(weber.id, "saveTheDate", { cardId: (await firstCard()).id });
    const entries = FakeArchive.read((await new ExportAccount(d).execute(ownerId)).bytes);
    const data = JSON.parse(new TextDecoder().decode(entries.find((e) => e.path === "data.json")!.bytes));
    const [wedding] = data.weddings;
    expect(wedding.cards).toHaveLength(4);
    expect(wedding.deliveries).toMatchObject([{ household: "Weber", kind: "saveTheDate", sharedVia: "link" }]);
    expect(wedding.opens).toMatchObject([{ household: "Weber", card: "Standard" }]);
    expect(wedding.guests.versions).toMatchObject([{ household: "Weber", item: "saveTheDate", version: "Standard" }]);
    expect(wedding.guests.households[0]).toMatchObject({ email: "weber@example.org" });
  });
});
