import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import { ExportAccount } from "@/application/account";
import { CreateCard, ExportCard, RunMailJobs, SendCardEmails, ShareCard, Unsubscribe } from "@/application/cards";
import type { Deps } from "@/application/deps";
import type { Section } from "@/application/ports";
import { buildCardModel, CARD_KINDS, defaultCardContent } from "@/domain/cards";
import { cardLayoutsFor, resolveDesign } from "@/domain/theme";
import { SECTION_KINDS } from "@/domain/sections";
import { FflateArchiveWriter } from "@/infrastructure/archive/zip";
import { SatoriCardRenderer } from "@/infrastructure/cards/renderer";
import { cardDeliveries, cards, households } from "@/infrastructure/db/schema";
import { createCardMailTemplates, createCardTexts } from "@/infrastructure/mail/card-templates";
import { SmtpMailer } from "@/infrastructure/mail/smtp";
import { DrizzleBillingRepository } from "@/infrastructure/repositories/billing";
import { DrizzleCardRepository } from "@/infrastructure/repositories/cards";
import { DrizzleGuestRepository } from "@/infrastructure/repositories/guests";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { cryptoTokens, hmacGuestLinks } from "@/infrastructure/system";
import { FsThemeCatalog } from "@/infrastructure/themes/fs-catalog";
import { FakeArchive, FakeClock, FakeMailer, InMemoryStorage } from "../fakes";
import { setupTestDatabase } from "./db";
import { testEnv } from "./env";

const db = setupTestDatabase();
const sections: Section[] = SECTION_KINDS.map((kind) => ({ kind, title: null, visible: true, body: "" }));
const repo = new DrizzleCardRepository(db);
const guests = new DrizzleGuestRepository(db);
const users = new DrizzleUserRepository(db);
const websites = new DrizzleWebsiteRepository(db);
const themes = new FsThemeCatalog(path.resolve("themes"));
const renderer = new SatoriCardRenderer(path.resolve("node_modules/@fontsource"));
const guestLinks = hmacGuestLinks("integration-secret-integration-secret");

let websiteId: string;
let ownerId: string;
let email: string;

beforeEach(async () => {
  email = `anna-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`;
  ownerId = (await users.create(email)).id;
  websiteId = (await websites.create({ ownerId, slug: `anna-${Date.now()}`, title: "Anna & Łukasz", weddingDate: "2027-06-12", themeId: "salbei", timezone: "Europe/Berlin" }, sections)).id;
});

/** Real repositories, renderer and templates; the mailer is real SMTP (Mailpit) when asked. */
function deps(options: { smtp?: boolean } = {}) {
  const { smtpPort } = testEnv();
  const mailer = options.smtp ? new SmtpMailer({ host: "localhost", port: smtpPort, secure: false, from: "Traureise <no-reply@traureise.localhost>" }) : new FakeMailer();
  return {
    users,
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
  guests.createHousehold(websiteId, { name, invitedEventIds: null, email, personalLine: "", people: [{ id: null, name: "Clara", isChild: false }] }, (id) => guestLinks.hash(guestLinks.tokenFor(id)));

async function newCard(d = deps(), kind: (typeof CARD_KINDS)[number] = "saveTheDate") {
  return new CreateCard(d).execute(ownerId, websiteId, kind);
}

describe("DrizzleCardRepository", () => {
  it("keeps one card per website and kind, and updates and deletes it", async () => {
    const card = await newCard();
    expect(await repo.create({ ...card, id: undefined } as never)).toBeNull();
    await repo.update(websiteId, "saveTheDate", { ...card, content: { ...card.content, text: "Neu" } });
    expect((await repo.find(websiteId, "saveTheDate"))?.content.text).toBe("Neu");
    await repo.delete(websiteId, "saveTheDate");
    expect(await repo.listByWebsite(websiteId)).toEqual([]);
  });

  it("records the first share and the first opening only", async () => {
    const card = await newCard();
    const weber = await household("Weber");
    const first = new Date("2026-10-18T10:00:00Z");
    await repo.markShared(card.id, weber.id, "whatsapp", first);
    await repo.markShared(card.id, weber.id, "link", new Date("2026-10-19T10:00:00Z"));
    expect(await repo.markOpened(card.id, weber.id, first)).toBe(true);
    expect(await repo.markOpened(card.id, weber.id, new Date())).toBe(false);
    await repo.setExcluded(card.id, weber.id, true);
    expect(await repo.listDeliveries(card.id)).toMatchObject([{ householdId: weber.id, sharedVia: "whatsapp", sharedAt: first, openedAt: first, excluded: true }]);
  });

  it("lets exactly one of several instances claim a queued email", async () => {
    const card = await newCard();
    const weber = await household("Weber", "weber@example.org");
    const at = new Date();
    expect(await repo.queueMail("card", card.id, [weber.id], at)).toBe(1);
    expect(await repo.listQueuedMail(10, websiteId)).toEqual([{ cardId: card.id, householdId: weber.id, websiteId, channel: "card" }]);
    const claims = await Promise.all([1, 2, 3, 4].map(() => repo.claimMail("card", card.id, weber.id, at)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await repo.queueMail("card", card.id, [weber.id], at)).toBe(0);
    expect(await repo.listQueuedMail(10, websiteId)).toEqual([]);
    await repo.finishMail("card", card.id, weber.id, { sentAt: at });
    expect(await repo.listDeliveries(card.id)).toMatchObject([{ emailedAt: at, emailQueuedAt: null, emailError: null }]);
  });

  it("turns stale claims into failures and claims each automatic reminder once", async () => {
    const card = await newCard(deps(), "invitation");
    const weber = await household("Weber", "weber@example.org");
    const at = new Date("2026-10-18T10:00:00Z");
    await repo.queueMail("reminder", card.id, [weber.id], at);
    await repo.claimMail("reminder", card.id, weber.id, at);
    expect(await repo.failStaleClaims(new Date("2026-10-18T10:20:00Z"))).toBe(1);
    expect(await repo.listDeliveries(card.id)).toMatchObject([{ reminderError: "interrupted", reminderQueuedAt: null, remindedAt: null }]);

    expect(await repo.claimAutomaticReminder(card.id, weber.id, 14, at)).toBe(true);
    expect(await repo.claimAutomaticReminder(card.id, weber.id, 14, at)).toBe(false);
    expect(await repo.claimAutomaticReminder(card.id, weber.id, 3, at)).toBe(true);
    expect(await repo.listInvitationsWithReminders()).toEqual([{ websiteId, cardId: card.id }]);
  });

  it("drops deliveries with the household (retention) and cards with the website", async () => {
    const card = await newCard();
    const weber = await household("Weber");
    await repo.markShared(card.id, weber.id, "link", new Date());
    await guests.deleteGuestData(websiteId);
    expect(await db.select().from(cardDeliveries).where(eq(cardDeliveries.cardId, card.id))).toEqual([]);
    await websites.delete(websiteId);
    expect(await db.select().from(cards).where(eq(cards.websiteId, websiteId))).toEqual([]);
  });

  it("clears the address on unsubscribe, and a new address ends it", async () => {
    const weber = await household("Weber", "weber@example.org");
    expect(await guests.unsubscribe(weber.id, new Date())).toBe(true);
    const [row] = await db.select().from(households).where(eq(households.id, weber.id));
    expect(row).toMatchObject({ email: null });
    expect(row!.unsubscribedAt).toBeInstanceOf(Date);
    await guests.updateHousehold(websiteId, weber.id, { name: "Weber", invitedEventIds: null, email: "neu@example.org", personalLine: "", people: [] });
    expect((await guests.findHousehold(websiteId, weber.id))?.unsubscribedAt).toBeNull();
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
      website: { title: "Anna & Łukasz", weddingDate: "2027-06-12", location: null, url: "http://localhost:3000/anna" },
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
    await newCard(d);
    const file = await new ExportCard(d).execute(ownerId, websiteId, "saveTheDate", "png");
    expect((await sharp(file.bytes).metadata()).width).toBe(1748);
  });
});

describe("sending cards by email", () => {
  it("delivers one email per household through SMTP, as the couple, with the card inline and the unsubscribe headers", async () => {
    const d = deps({ smtp: true });
    const to = `weber-${Date.now()}@example.org`;
    const weber = await household("Weber", to);
    await newCard(d);
    expect(await new SendCardEmails(d).execute(ownerId, websiteId, "saveTheDate", "all")).toEqual({ queued: 1 });
    // Two instances run the job at the same time: the claim lets only one send.
    const runs = await Promise.all([new RunMailJobs(d).execute({ websiteId }), new RunMailJobs(d).execute({ websiteId })]);
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
  it("contains cards, addresses and statuses", async () => {
    const d = deps();
    d.archive = new FakeArchive();
    const weber = await household("Weber", "weber@example.org");
    await newCard(d);
    await new ShareCard(d).execute(ownerId, websiteId, "saveTheDate", weber.id, "link");
    const entries = FakeArchive.read((await new ExportAccount(d).execute(ownerId)).bytes);
    const data = JSON.parse(new TextDecoder().decode(entries.find((e) => e.path === "data.json")!.bytes));
    expect(data.websites[0].cards[0]).toMatchObject({ kind: "saveTheDate", deliveries: [{ household: "Weber", sharedVia: "link" }] });
    expect(data.websites[0].guests.households[0]).toMatchObject({ email: "weber@example.org" });
  });
});
