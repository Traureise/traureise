import { beforeEach, describe, expect, it } from "vitest";
import { DeleteAccount, ExportAccount } from "@/application/account";
import {
  ExportCard,
  GetCardEditor,
  GetCardPreview,
  GetEngagementPage,
  GetHouseholdPage,
  GetUnsubscribe,
  MarkCardsOpened,
  MarkEngagementShared,
  RunMailJobs,
  SaveCard,
  SendCardEmails,
  SendReminders,
  SetCardExcluded,
  ShareCard,
  Unsubscribe,
} from "@/application/cards";
import { LockedError, NotFoundError, ValidationError } from "@/application/errors";
import { GetGuestPage, RunGuestJobs, SaveHousehold, SaveRsvpSettings, SubmitGuestResponse } from "@/application/guests";
import { AddItem } from "@/application/sections";
import { CreateWedding, DeleteWedding, UpdateWeddingDetails } from "@/application/weddings";
import { SetPublished } from "@/application/websites";
import type { PaidTier } from "@/domain/billing";
import type { CardKind } from "@/domain/cards";
import { FakeArchive, FakeCardRenderer, createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: { id: string; email: string };
let weddingId: string;
let websiteId: string;
let ceremony: string;

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  anna = await f.users.create("anna@example.org");
  weddingId = (await new CreateWedding(f.deps).execute(anna.id, { title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12" })).id;
  websiteId = (await f.websites.listByWedding(weddingId))[0]!.id;
  ceremony = (await new AddItem(f.deps).execute(anna.id, websiteId, "schedule", { eventType: "ceremony", name: "Trauung", startDate: "2027-06-12", startTime: "14:30", venueName: "Gut Kaden" })).id;
});

/** The first version of a kind, generated with the wedding. */
const create = async (kind: CardKind) => (await f.cards.listByWedding(weddingId)).find((c) => c.kind === kind && c.position === 0)!;
const editor = async (kind: CardKind, userId = anna.id) => new GetCardEditor(f.deps).execute(userId, (await create(kind)).id);
const household = (name: string, email: string | null = null, personalLine = "") =>
  new SaveHousehold(f.deps).execute(anna.id, weddingId, null, { name, email, personalLine, people: [{ name: `${name} 1` }, { name: `${name} 2` }] });
const token = (householdId: string) => f.guestLinks.tokenFor(householdId);
const page = (householdId: string) => new GetHouseholdPage(f.deps).execute(token(householdId));
const share = (kind: CardKind, householdId: string, via: "whatsapp" | "link" = "link") => new ShareCard(f.deps).execute(anna.id, weddingId, kind, householdId, via);
const sendEmails = (kind: CardKind, target: { householdId: string } | "all") => new SendCardEmails(f.deps).execute(anna.id, weddingId, kind, target);
const runMail = () => new RunMailJobs(f.deps).execute({ weddingId });
const exportCard = async (kind: CardKind, format: "png" | "a6" | "a5") => new ExportCard(f.deps).execute(anna.id, (await create(kind)).id, format);
const preview = async (kind: CardKind) => new GetCardPreview(f.deps).execute(anna.id, (await create(kind)).id);
const grant = async (tier: PaidTier) => {
  f.deps.billing.enabled = true;
  await f.billingRepo.applyEvent(`evt-${Math.random()}`, { kind: "grant", weddingId, tier, purchaseRef: `ord-${Math.random()}`, provider: "testpay", validUntil: new Date("2028-06-13T00:00:00Z") });
};
const lockAll = () => {
  f.deps.billing.enabled = true;
};

describe("creating and editing cards", () => {
  it("generates one first version per kind with the website's design and translated defaults", async () => {
    const card = await create("saveTheDate");
    expect(card).toMatchObject({ kind: "saveTheDate", label: "Standard", themeId: "salbei", layoutId: "bogen", envelope: true, content: { names: "Anna & Ben", text: "Einladung folgt", heading: "Haltet euch den Tag frei" } });
    // The wedding's first event fills invitations that had none yet.
    expect(await create("invitation")).toMatchObject({ reminderDays: [14, 3], content: { heading: "Wir heiraten", eventId: ceremony } });
  });

  it("offers themes with layouts for the kind, and saves a different theme, palette and texts", async () => {
    const view = await editor("thankYou");
    expect(view.themes.map((t) => t.id)).toEqual(["salbei", "terrakotta"]);
    expect(view.themes[0]!.layouts.map((l) => l.id)).toEqual(["bogen", "schlicht"]);
    expect(view.versions).toEqual([{ id: view.card.id, label: "Standard" }]);
    await new SaveCard(f.deps).execute(anna.id, view.card.id, {
      themeId: "terrakotta",
      paletteId: "dunkel",
      layoutId: "schlicht",
      envelope: false,
      content: { heading: "Danke!", names: "Anna & Ben", text: "Für alles." },
      message: "Liebe {name}",
    });
    expect((await editor("thankYou")).card).toMatchObject({ themeId: "terrakotta", paletteId: "dunkel", layoutId: "schlicht", envelope: false, content: { heading: "Danke!" } });
  });

  it("refuses unknown themes, layouts, events and someone else's photos", async () => {
    const { id } = await create("invitation");
    const save = (patch: object) => new SaveCard(f.deps).execute(anna.id, id, { themeId: "salbei", content: { names: "Anna & Ben" }, ...patch });
    await expect(save({ themeId: "nope" })).rejects.toMatchObject({ fieldErrors: { themeId: "invalid_option" } });
    await expect(save({ layoutId: "schlicht" })).rejects.toMatchObject({ fieldErrors: { layoutId: "invalid_option" } });
    await expect(save({ content: { names: "A", eventId: "unknown" } })).rejects.toMatchObject({ fieldErrors: { "content.eventId": "invalid_option" } });
    await expect(save({ photoKey: "other.webp" })).rejects.toMatchObject({ fieldErrors: { photoKey: "invalid_image" } });
  });

  it("belongs to the wedding's owner", async () => {
    const ben = await f.users.create("ben@example.org");
    await expect(editor("saveTheDate", ben.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new SaveCard(f.deps).execute(ben.id, (await create("saveTheDate")).id, {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(new ExportCard(f.deps).execute(ben.id, (await create("saveTheDate")).id, "png")).rejects.toBeInstanceOf(NotFoundError);
    await expect(new GetCardPreview(f.deps).execute(ben.id, (await create("saveTheDate")).id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new MarkEngagementShared(f.deps).execute(ben.id, (await create("engagement")).id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("follow changed names and place unless the couple wrote their own", async () => {
    expect((await create("saveTheDate")).content).toMatchObject({ names: "Anna & Ben", place: "" });
    const thankYou = await create("thankYou");
    await new SaveCard(f.deps).execute(anna.id, thankYou.id, { ...thankYou, content: { ...thankYou.content, names: "Anna und Ben" } });
    await new UpdateWeddingDetails(f.deps).execute(anna.id, weddingId, { title: "Anna & Ben Kern", hasDate: true, weddingDate: "2027-06-12", location: "Beispielstadt" });
    expect((await create("saveTheDate")).content).toMatchObject({ names: "Anna & Ben Kern", place: "Beispielstadt" });
    expect((await create("thankYou")).content.names).toBe("Anna und Ben");
  });
});

describe("the website link and the date", () => {
  it("the Save the Date links the household's website version only once it is published", async () => {
    expect((await editor("saveTheDate")).offlineWebsites).toBe(true);
    const kern = await household("Kern");
    await share("saveTheDate", kern.id);
    const card = async () => {
      const view = await page(kern.id);
      return view?.state === "page" ? view.cards.map((c) => [c.kind, c.websiteUrl, c.icsUrl]) : null;
    };
    expect(await card()).toEqual([["saveTheDate", null, "/anna-und-ben/hochzeit.ics"]]);
    await new SetPublished(f.deps).execute(anna.id, websiteId, true);
    expect(await card()).toEqual([["saveTheDate", "/anna-und-ben", "/anna-und-ben/hochzeit.ics"]]);
    expect((await editor("saveTheDate")).offlineWebsites).toBe(false);
  });

  it("the engagement announcement never links the website", async () => {
    await new SetPublished(f.deps).execute(anna.id, websiteId, true);
    const engagement = await new GetEngagementPage(f.deps).execute("anna-und-ben");
    expect(engagement?.state === "active" && [engagement.card.websiteUrl, engagement.card.model.footer]).toEqual([null, null]);
  });

  it("without a date, Save the Date and invitation wait: no links, emails or exports, but the editor shows them", async () => {
    await new UpdateWeddingDetails(f.deps).execute(anna.id, weddingId, { title: "Anna & Ben", hasDate: false });
    const weber = await household("Weber", "weber@example.org");
    expect((await editor("saveTheDate")).waitsForDate).toBe(true);
    expect((await preview("saveTheDate")).cards[0]!.model.details).toEqual(["Datum folgt"]);
    for (const kind of ["saveTheDate", "invitation"] as const) {
      await expect(share(kind, weber.id)).rejects.toMatchObject({ fieldErrors: { _: "no_date" } });
      await expect(sendEmails(kind, "all")).rejects.toMatchObject({ fieldErrors: { _: "no_date" } });
      await expect(exportCard(kind, "png")).rejects.toMatchObject({ fieldErrors: { _: "no_date" } });
    }
    expect((await editor("thankYou")).waitsForDate).toBe(false);
    await expect(share("thankYou", weber.id)).resolves.toBeDefined();
    expect(await new GetEngagementPage(f.deps).execute("anna-und-ben")).toMatchObject({ state: "active" });
  });

  it("the engagement link counts as shared once the couple copied it or sent it by WhatsApp", async () => {
    const engagement = await create("engagement");
    await new MarkEngagementShared(f.deps).execute(anna.id, engagement.id);
    const shared = (await create("engagement")).sharedAt;
    expect(shared).toBeInstanceOf(Date);
    f.clock.advance(1000);
    await new MarkEngagementShared(f.deps).execute(anna.id, engagement.id);
    expect((await create("engagement")).sharedAt).toEqual(shared);
    await expect(new MarkEngagementShared(f.deps).execute(anna.id, (await create("thankYou")).id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("gating", () => {
  it("lets everyone design and preview for free", async () => {
    lockAll();
    expect((await editor("thankYou")).active).toBe(false);
    expect((await preview("thankYou")).cards[0]!.model.kind).toBe("thankYou");
  });

  it("needs Einladungen for Save the Dates and invitations, Komplett for the other cards", async () => {
    lockAll();
    const weber = await household("Weber", "weber@example.org");
    await expect(exportCard("saveTheDate", "png")).rejects.toBeInstanceOf(LockedError);
    await expect(share("saveTheDate", weber.id)).rejects.toBeInstanceOf(LockedError);
    await expect(sendEmails("saveTheDate", "all")).rejects.toBeInstanceOf(LockedError);
    expect(await new GetEngagementPage(f.deps).execute("anna-und-ben")).toMatchObject({ state: "inactive" });

    await grant("invitations");
    await expect(share("saveTheDate", weber.id)).resolves.toBeDefined();
    await expect(exportCard("thankYou", "a6")).rejects.toBeInstanceOf(LockedError);

    await grant("complete");
    expect(await exportCard("thankYou", "a6")).toMatchObject({ contentType: "application/pdf", filename: "dankeskarte-a6.pdf" });
    expect(await new GetEngagementPage(f.deps).execute("anna-und-ben")).toMatchObject({ state: "active" });
  });

  it("exports PNG, A6 and A5 with the photo", async () => {
    const png = await exportCard("saveTheDate", "png");
    expect(png).toMatchObject({ contentType: "image/png", filename: "save-the-date.png" });
    await exportCard("saveTheDate", "a5");
    expect((f.deps.cardRenderer as FakeCardRenderer).calls.map((c) => c.format)).toEqual(["png-1748", "a5"]);
  });
});

describe("the household page", () => {
  it("keeps the v3 response page while no card has been sent", async () => {
    const weber = await household("Weber");
    expect(await page(weber.id)).toMatchObject({ state: "page", cards: [], form: { state: "open" } });
  });

  it("shows the Save the Date, then the invitation with the form, then the thank-you card first", async () => {
    const weber = await household("Weber", null, "Danke für den Kuchen!");
    // Nothing sent yet: the v3 response page, so links already sent keep working.
    expect(await page(weber.id)).toMatchObject({ state: "page", cards: [], form: { state: "open" } });

    await share("saveTheDate", weber.id);
    let view = await page(weber.id);
    expect(view).toMatchObject({ state: "page", greeting: "Weber", envelope: true, form: null });
    if (view?.state !== "page") throw new Error("page");
    expect(view.cards.map((c) => c.kind)).toEqual(["saveTheDate"]);
    expect(view.cards[0]!.icsUrl).toBe("/anna-und-ben/hochzeit.ics");

    f.clock.advance(86_400_000);
    await share("invitation", weber.id, "whatsapp");
    view = await page(weber.id);
    if (view?.state !== "page") throw new Error("page");
    expect(view.cards.map((c) => c.kind)).toEqual(["invitation", "saveTheDate"]);
    expect(view.form?.state).toBe("open");

    f.clock.advance(86_400_000);
    await share("thankYou", weber.id);
    view = await page(weber.id);
    if (view?.state !== "page") throw new Error("page");
    expect(view.cards.map((c) => c.kind)).toEqual(["thankYou", "invitation", "saveTheDate"]);
    expect(view.cards[0]!.model.personalLine).toBe("Danke für den Kuchen!");
  });

  it("accepts answers on the v3 page and with the invitation, not while only a Save the Date is shown", async () => {
    const weber = await household("Weber");
    const answer = { people: Object.fromEntries(weber.people.map((p) => [p.id, { attending: false }])) };
    await expect(new SubmitGuestResponse(f.deps).execute({ token: token(weber.id), input: answer, ip: "10.0.0.1" })).resolves.toBeUndefined();
    await share("saveTheDate", weber.id);
    await expect(new SubmitGuestResponse(f.deps).execute({ token: token(weber.id), input: answer, ip: "10.0.0.1" })).rejects.toMatchObject({ fieldErrors: { _: "inactive" } });
    await share("invitation", weber.id);
    await expect(new SubmitGuestResponse(f.deps).execute({ token: token(weber.id), input: answer, ip: "10.0.0.1" })).resolves.toBeUndefined();
  });

  it("records opened once, only for cards the page shows, never from the couple's preview", async () => {
    const weber = await household("Weber");
    await preview("saveTheDate");
    await share("saveTheDate", weber.id);
    expect(await new MarkCardsOpened(f.deps).execute(token(weber.id), ["saveTheDate", "invitation"])).toEqual(["saveTheDate"]);
    expect(await new MarkCardsOpened(f.deps).execute(token(weber.id), ["saveTheDate"])).toEqual([]);
    expect(await new MarkCardsOpened(f.deps).execute("unknown", ["saveTheDate"])).toEqual([]);
    const entry = (await new GetGuestPage(f.deps).execute(anna.id, weddingId)).households[0]!;
    expect(entry.deliveries.saveTheDate).toMatchObject({ sharedVia: "link" });
    expect(entry.deliveries.saveTheDate?.openedAt).toBeInstanceOf(Date);
  });

  it("leaves out households the couple excluded", async () => {
    const weber = await household("Weber");
    await new SetCardExcluded(f.deps).execute(anna.id, weddingId, "saveTheDate", weber.id, true);
    await expect(share("saveTheDate", weber.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await page(weber.id)).toMatchObject({ cards: [] });
  });

  it("is null for unknown links", async () => {
    expect(await new GetHouseholdPage(f.deps).execute("nope")).toBeNull();
  });
});

describe("sending by email", () => {
  it("queues one email per household with an address and sends it once, as the couple, with the card and an unsubscribe link", async () => {
    const weber = await household("Weber", "weber@example.org");
    await household("Kern");
    expect(await sendEmails("saveTheDate", "all")).toEqual({ queued: 1 });
    expect(f.mailer.sent).toEqual([]);

    expect(await runMail()).toMatchObject({ sent: 1, failed: 0 });
    expect(await runMail()).toMatchObject({ sent: 0 });
    expect(f.mailer.sent).toHaveLength(1);
    const [mail] = f.mailer.sent;
    expect(mail).toMatchObject({ to: "weber@example.org", fromName: "Anna & Ben über Traureise", replyTo: "anna@example.org" });
    expect(mail!.headers).toEqual({
      "List-Unsubscribe": `<http://localhost:3000/api/abmelden/stop-${weber.id}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(mail!.attachments).toMatchObject([{ contentType: "image/png", cid: "karte" }]);
    expect(JSON.parse(mail!.text)).toMatchObject({ pageUrl: `http://localhost:3000/antwort/link-${weber.id}`, unsubscribeUrl: `http://localhost:3000/abmelden/stop-${weber.id}`, message: "Hallo Weber, merkt euch den Tag!" });

    expect(await sendEmails("saveTheDate", "all")).toEqual({ queued: 0 });
    expect(await sendEmails("saveTheDate", { householdId: weber.id })).toEqual({ queued: 1 });
  });

  it("refuses a single household without an address", async () => {
    const kern = await household("Kern");
    await expect(sendEmails("saveTheDate", { householdId: kern.id })).rejects.toMatchObject({ fieldErrors: { email: "no_email" } });
  });

  it("renders a personal image only for thank-you cards with a personal line", async () => {
    await household("Weber", "weber@example.org", "Danke für den Kuchen!");
    await household("Kern", "kern@example.org");
    await household("Roth", "roth@example.org");
    await sendEmails("thankYou", "all");
    await runMail();
    expect((f.deps.cardRenderer as FakeCardRenderer).calls.map((c) => c.personalLine)).toEqual(["Danke für den Kuchen!", null]);
  });

  it("marks a failed send and never retries it by itself", async () => {
    await household("Weber", "weber@example.org");
    await sendEmails("saveTheDate", "all");
    f.mailer.send = async () => {
      throw new Error("smtp down");
    };
    expect(await runMail()).toMatchObject({ sent: 0, failed: 1 });
    expect(await runMail()).toMatchObject({ sent: 0, failed: 0 });
    const entry = (await new GetGuestPage(f.deps).execute(anna.id, weddingId)).households[0]!;
    expect(entry.deliveries.saveTheDate).toMatchObject({ emailError: "send_failed", emailedAt: null });
  });

  it("turns claims of a crashed run into failures instead of sending again", async () => {
    const weber = await household("Weber", "weber@example.org");
    await sendEmails("saveTheDate", "all");
    expect(await f.cards.claimMail("card", weber.id, "saveTheDate", f.clock.now())).toBe(true);
    f.clock.advance(16 * 60_000);
    expect(await runMail()).toMatchObject({ sent: 0 });
    expect((await f.cards.listDeliveries(weddingId))[0]).toMatchObject({ emailError: "interrupted", emailedAt: null });
  });

  it("skips households that unsubscribed after the email was queued", async () => {
    const weber = await household("Weber", "weber@example.org");
    await sendEmails("saveTheDate", "all");
    expect(await new Unsubscribe(f.deps).execute(f.guestLinks.unsubscribeTokenFor(weber.id))).toBe(true);
    expect(await runMail()).toMatchObject({ sent: 0, failed: 1 });
    expect(f.mailer.sent).toEqual([]);
  });
});

describe("unsubscribing", () => {
  it("clears the address without login and tells the household whose emails stop", async () => {
    const weber = await household("Weber", "weber@example.org");
    const stop = f.guestLinks.unsubscribeTokenFor(weber.id);
    expect(await new GetUnsubscribe(f.deps).execute(stop)).toEqual({ couple: "Anna & Ben", household: "Weber", done: false });
    expect(await new Unsubscribe(f.deps).execute(stop)).toBe(true);
    expect(await new GetUnsubscribe(f.deps).execute(stop)).toEqual({ couple: "Anna & Ben", household: "Weber", done: true });
    const entry = (await new GetGuestPage(f.deps).execute(anna.id, weddingId)).households[0]!;
    expect(entry).toMatchObject({ email: null });
    expect(entry.unsubscribedAt).toBeInstanceOf(Date);
    expect(await new Unsubscribe(f.deps).execute("forged")).toBe(false);
    expect(await new GetUnsubscribe(f.deps).execute("forged")).toBeNull();
  });
});

describe("reminders", () => {
  beforeEach(async () => {
    await new SaveRsvpSettings(f.deps).execute(anna.id, weddingId, { replyBy: "2027-05-01" });
  });

  it("emails open households with an address on the configured days, once each", async () => {
    const weber = await household("Weber", "weber@example.org");
    const kern = await household("Kern", "kern@example.org");
    const roth = await household("Roth");
    f.clock.current = new Date("2027-03-01T10:00:00Z");
    for (const h of [weber, kern, roth]) await share("invitation", h.id);
    await new SubmitGuestResponse(f.deps).execute({ token: token(kern.id), input: { people: Object.fromEntries(kern.people.map((p) => [p.id, { attending: false }])) }, ip: "10.0.0.2" });

    f.clock.current = new Date("2027-04-10T10:00:00Z");
    expect((await runMail()).reminders).toBe(0);
    f.clock.current = new Date("2027-04-17T10:00:00Z");
    expect((await runMail()).reminders).toBe(1);
    expect((await runMail()).reminders).toBe(0);
    f.clock.current = new Date("2027-04-28T10:00:00Z");
    expect((await runMail()).reminders).toBe(1);
    f.clock.current = new Date("2027-05-02T10:00:00Z");
    expect((await runMail()).reminders).toBe(0);
    expect(f.mailer.sent.map((m) => m.to)).toEqual(["weber@example.org", "weber@example.org"]);
    expect(f.mailer.sent[0]!.subject).toBe("Erinnerung: Anna & Ben");
  });

  it("are not sent by the run that only sends what the couple just queued", async () => {
    const weber = await household("Weber", "weber@example.org");
    f.clock.current = new Date("2027-03-01T10:00:00Z");
    await share("invitation", weber.id);
    f.clock.current = new Date("2027-04-28T10:00:00Z");
    expect((await new RunMailJobs(f.deps).execute({ weddingId, automatic: false })).reminders).toBe(0);
    expect((await runMail()).reminders).toBe(1);
  });

  it("are part of the regular guest jobs and need the Einladungen tier", async () => {
    const weber = await household("Weber", "weber@example.org");
    f.clock.current = new Date("2027-03-01T10:00:00Z");
    await share("invitation", weber.id);
    await grant("rsvp");
    f.clock.current = new Date("2027-04-28T10:00:00Z");
    expect((await new RunGuestJobs(f.deps).execute({ weddingId })).reminders).toBe(0);
  });

  it("has a button: email where there is an address, otherwise a WhatsApp link", async () => {
    const weber = await household("Weber", "weber@example.org");
    const roth = await household("Roth");
    const result = await new SendReminders(f.deps).execute(anna.id, weddingId, "all");
    expect(result.queued).toBe(1);
    expect(result.whatsapp.map((w) => w.householdId)).toEqual([roth.id]);
    expect(result.whatsapp[0]).toMatchObject({ link: `http://localhost:3000/antwort/link-${roth.id}`, message: "Hallo {name}, denkt an eure Antwort." });
    await runMail();
    expect(f.mailer.sent.map((m) => m.to)).toEqual(["weber@example.org"]);
    const entry = (await new GetGuestPage(f.deps).execute(anna.id, weddingId)).households.find((h) => h.id === weber.id)!;
    expect(entry.deliveries.invitation?.remindedAt).toBeInstanceOf(Date);
  });

  it("stop when the household answers or the reply-by date has passed", async () => {
    const weber = await household("Weber", "weber@example.org");
    expect((await new SendReminders(f.deps).execute(anna.id, weddingId, "all")).queued).toBe(1);
    // Answered after the reminder was queued: it is dropped, not sent.
    await new SubmitGuestResponse(f.deps).execute({ token: token(weber.id), input: { people: Object.fromEntries(weber.people.map((p) => [p.id, { attending: false }])) }, ip: "10.0.0.3" });
    expect(await runMail()).toMatchObject({ sent: 0, failed: 1 });
    expect(f.mailer.sent).toEqual([]);
    await expect(new SendReminders(f.deps).execute(anna.id, weddingId, { householdId: weber.id })).rejects.toMatchObject({ fieldErrors: { _: "answered" } });

    await household("Kern", "kern@example.org");
    f.clock.current = new Date("2027-05-02T10:00:00Z");
    await expect(new SendReminders(f.deps).execute(anna.id, weddingId, "all")).rejects.toMatchObject({ fieldErrors: { _: "closed" } });
    expect((await new GetGuestPage(f.deps).execute(anna.id, weddingId)).replyOpen).toBe(false);
  });

  it("keeps the WhatsApp reminder in RSVP and email reminders in Einladungen", async () => {
    await household("Weber", "weber@example.org");
    await household("Roth");
    await grant("rsvp");
    const result = await new SendReminders(f.deps).execute(anna.id, weddingId, "all");
    expect(result.queued).toBe(0);
    expect(result.whatsapp).toHaveLength(2);
  });
});

describe("account rights and retention", () => {
  it("exports cards, addresses, personal lines and statuses", async () => {
    const weber = await household("Weber", "weber@example.org", "Danke!");
    await share("saveTheDate", weber.id);
    await new MarkCardsOpened(f.deps).execute(token(weber.id), ["saveTheDate"]);
    const entries = FakeArchive.read((await new ExportAccount(f.deps).execute(anna.id)).bytes);
    const data = JSON.parse(new TextDecoder().decode(entries.find((e) => e.path === "data.json")!.bytes));
    const wedding = data.weddings[0];
    expect(wedding.cards.find((c: { kind: string }) => c.kind === "saveTheDate")).toMatchObject({ label: "Standard", content: { names: "Anna & Ben" } });
    expect(wedding.deliveries).toMatchObject([{ household: "Weber", kind: "saveTheDate", sharedVia: "link" }]);
    expect(wedding.opens).toMatchObject([{ household: "Weber", card: "Standard" }]);
    expect(wedding.guests.households[0]).toMatchObject({ email: "weber@example.org", personalLine: "Danke!" });
  });

  it("removes cards, deliveries and opens with the guest data, the wedding and the account", async () => {
    const weber = await household("Weber", "weber@example.org");
    await share("saveTheDate", weber.id);
    await new MarkCardsOpened(f.deps).execute(token(weber.id), ["saveTheDate"]);
    await f.guests.deleteGuestData(weddingId);
    expect(await f.cards.listDeliveries(weddingId)).toEqual([]);
    expect(await f.cards.listOpens(weddingId)).toEqual([]);
    await new DeleteWedding(f.deps).execute(anna.id, weddingId);
    expect(f.cards.cards).toEqual([]);
    await new DeleteAccount(f.deps).execute(anna.id, "anna@example.org");
  });
});
