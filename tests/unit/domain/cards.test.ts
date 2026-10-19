import { describe, expect, it } from "vitest";
import {
  buildCardModel,
  cardCounts,
  cardKindFromSlug,
  CARD_SLUGS,
  defaultCardContent,
  deliveryStatus,
  emailRecipients,
  followWeddingDetails,
  householdPageContent,
  parseCardInput,
  personalize,
  reminderDue,
  sentAt,
  tintSvg,
  type CardLabels,
  type Delivery,
} from "@/domain/cards";
import { parseThemeManifest, resolveDesign } from "@/domain/theme";

const at = (iso: string) => new Date(iso);
const delivery = (patch: Partial<Delivery> = {}): Delivery => ({
  excluded: false,
  sharedAt: null,
  sharedVia: null,
  emailQueuedAt: null,
  emailedAt: null,
  emailError: null,
  openedAt: null,
  reminderOffset: null,
  reminderQueuedAt: null,
  remindedAt: null,
  reminderError: null,
  ...patch,
});

describe("card slugs", () => {
  it("map every kind to a German URL segment and back", () => {
    expect(CARD_SLUGS).toEqual({ saveTheDate: "save-the-date", invitation: "einladung", thankYou: "dankeskarte", engagement: "verlobung" });
    expect(cardKindFromSlug("einladung")).toBe("invitation");
    expect(cardKindFromSlug("archiv")).toBeNull();
  });
});

describe("parseCardInput", () => {
  const valid = {
    themeId: "salbei",
    paletteId: "nebel",
    fontPairingId: null,
    layoutId: "bogen",
    envelope: true,
    photoKey: null,
    content: { heading: " Wir heiraten ", names: "Anna & Ben", text: "Feiert mit uns", place: "", eventId: null, time: "", venue: "", showReplyBy: true },
    message: "Hallo {name}",
    reminderDays: [3, 14, 3],
    reminderMessage: "",
  };

  it("trims texts, sorts reminder days from the earliest reminder on and drops doubles", () => {
    const parsed = parseCardInput(valid);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));
    expect(parsed.value.content.heading).toBe("Wir heiraten");
    expect(parsed.value.reminderDays).toEqual([14, 3]);
    expect(parsed.value.reminderMessage).toBeNull();
  });

  it("rejects too long texts, bad reminder days and missing names", () => {
    const bad = (patch: object) => parseCardInput({ ...valid, ...patch });
    expect(bad({ content: { ...valid.content, text: "x".repeat(801) } })).toMatchObject({ ok: false, fieldErrors: { "content.text": "too_long" } });
    expect(bad({ reminderDays: [91] }).ok).toBe(false);
    expect(bad({ reminderDays: [1, 2, 3, 4, 5, 6] }).ok).toBe(false);
    expect(bad({ content: { ...valid.content, names: " " } })).toMatchObject({ ok: false, fieldErrors: { "content.names": "required" } });
  });
});

describe("personalize", () => {
  it("puts the household's name into a message", () => {
    expect(personalize("Liebe {name}, schaut mal!", "Familie Weber")).toBe("Liebe Familie Weber, schaut mal!");
  });
});

describe("tintSvg", () => {
  it("colours an ornament and returns it as a data URI", () => {
    const uri = tintSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h2v2H0z"/></svg>', "#b8935a");
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(atob(uri.split(",")[1]!)).toContain('<svg fill="#b8935a" ');
  });
});

describe("householdPageContent", () => {
  const card = (kind: "saveTheDate" | "invitation" | "thankYou", d: Delivery | null, active = true) => ({ kind, active, delivery: d });

  it("keeps the v3 page (just the form) when no card is active", () => {
    expect(householdPageContent({ cards: [card("saveTheDate", delivery({ sharedAt: at("2026-01-01") }), false)], rsvpActive: true })).toEqual({ kinds: [], form: true });
  });

  it("shows a Save the Date alone, without the form, once an invitation exists that has not been sent yet", () => {
    const content = householdPageContent({ cards: [card("saveTheDate", delivery({ emailedAt: at("2026-01-01") })), card("invitation", null)], rsvpActive: true });
    expect(content).toEqual({ kinds: ["saveTheDate"], form: false });
  });

  it("shows the newest card first and the form with the invitation", () => {
    const content = householdPageContent({
      cards: [card("saveTheDate", delivery({ sharedAt: at("2026-01-01") })), card("invitation", delivery({ emailedAt: at("2026-05-01") }))],
      rsvpActive: true,
    });
    expect(content).toEqual({ kinds: ["invitation", "saveTheDate"], form: true });
    const after = householdPageContent({
      cards: [card("saveTheDate", delivery({ sharedAt: at("2026-01-01") })), card("invitation", delivery({ emailedAt: at("2026-05-01") })), card("thankYou", delivery({ sharedAt: at("2027-08-01") }))],
      rsvpActive: true,
    });
    expect(after.kinds).toEqual(["thankYou", "invitation", "saveTheDate"]);
  });

  it("leaves out cards the household is left out of and the form without the RSVP links", () => {
    expect(householdPageContent({ cards: [card("saveTheDate", delivery({ excluded: true, sharedAt: at("2026-01-01") }))], rsvpActive: false })).toEqual({ kinds: [], form: false });
  });

  it("keeps the v3 page while nothing was sent, even when an invitation card exists", () => {
    expect(householdPageContent({ cards: [card("saveTheDate", null), card("invitation", null)], rsvpActive: true })).toEqual({ kinds: [], form: true });
  });

  it("shows a Save the Date on its own also without an invitation card", () => {
    expect(householdPageContent({ cards: [card("saveTheDate", delivery({ sharedAt: at("2026-01-01") }))], rsvpActive: true })).toEqual({ kinds: ["saveTheDate"], form: false });
  });
});

describe("delivery status", () => {
  it("is sent from the first send, by whichever channel came first", () => {
    expect(sentAt(delivery({ sharedAt: at("2026-03-01"), emailedAt: at("2026-02-01") }))).toEqual(at("2026-02-01"));
    expect(sentAt(null)).toBeNull();
  });

  it("goes from not sent through queued or failed to sent and opened", () => {
    expect(deliveryStatus(null)).toBe("notSent");
    expect(deliveryStatus(delivery({ excluded: true }))).toBe("excluded");
    expect(deliveryStatus(delivery({ emailQueuedAt: at("2026-01-01") }))).toBe("queued");
    expect(deliveryStatus(delivery({ emailError: "smtp" }))).toBe("failed");
    expect(deliveryStatus(delivery({ sharedAt: at("2026-01-01") }))).toBe("sent");
    expect(deliveryStatus(delivery({ emailedAt: at("2026-01-01"), openedAt: at("2026-01-02") }))).toBe("opened");
  });

  it("counts households for the dashboard, without those left out", () => {
    const counts = cardCounts([delivery({ sharedAt: at("2026-01-01"), openedAt: at("2026-01-02") }), delivery({ emailedAt: at("2026-01-01") }), null, delivery({ excluded: true })]);
    expect(counts).toEqual({ households: 3, sent: 2, opened: 1 });
  });

  it("sends a card by email to households with an address that have not had it yet", () => {
    const list = [
      { id: "a", email: "a@example.org", delivery: null },
      { id: "b", email: null, delivery: null },
      { id: "c", email: "c@example.org", delivery: delivery({ sharedAt: at("2026-01-01") }) },
      { id: "d", email: "d@example.org", delivery: delivery({ excluded: true }) },
      { id: "e", email: "e@example.org", delivery: delivery({ emailQueuedAt: at("2026-01-01") }) },
      { id: "f", email: "f@example.org", delivery: delivery({ emailError: "smtp" }) },
    ];
    expect(emailRecipients(list).map((h) => h.id)).toEqual(["a", "f"]);
  });
});

describe("reminderDue", () => {
  const base = { replyBy: "2027-05-01", days: [14, 3], lastOffset: null, timeZone: "Europe/Berlin", sentAt: at("2027-03-01T10:00:00Z") };

  it("is due from the reminder day on, in the website's timezone", () => {
    expect(reminderDue({ ...base, now: at("2027-04-16T21:00:00Z") })).toBeNull();
    // 22:30 UTC on 16 April is already 17 April in Berlin: 14 days before 1 May.
    expect(reminderDue({ ...base, now: at("2027-04-16T22:30:00Z") })).toBe(14);
  });

  it("sends each reminder once and only the latest when several are due", () => {
    expect(reminderDue({ ...base, lastOffset: 14, now: at("2027-04-20T10:00:00Z") })).toBeNull();
    expect(reminderDue({ ...base, lastOffset: 14, now: at("2027-04-28T10:00:00Z") })).toBe(3);
    expect(reminderDue({ ...base, now: at("2027-04-29T10:00:00Z") })).toBe(3);
    expect(reminderDue({ ...base, lastOffset: 3, now: at("2027-04-30T10:00:00Z") })).toBeNull();
  });

  it("never reminds of an invitation sent on or after the reminder day", () => {
    expect(reminderDue({ ...base, sentAt: at("2027-04-20T10:00:00Z"), now: at("2027-04-21T10:00:00Z") })).toBeNull();
    expect(reminderDue({ ...base, sentAt: at("2027-04-20T10:00:00Z"), now: at("2027-04-28T10:00:00Z") })).toBe(3);
  });

  it("stops after the reply-by day and without a reply-by date or days", () => {
    expect(reminderDue({ ...base, now: at("2027-05-02T10:00:00Z") })).toBeNull();
    expect(reminderDue({ ...base, replyBy: null, now: at("2027-04-28T10:00:00Z") })).toBeNull();
    expect(reminderDue({ ...base, days: [], now: at("2027-04-28T10:00:00Z") })).toBeNull();
    expect(reminderDue({ ...base, days: [0], now: at("2027-05-01T10:00:00Z") })).toBe(0);
  });
});

describe("buildCardModel", () => {
  const parsed = parseThemeManifest(
    {
      id: "salbei",
      name: { de: "Salbei" },
      category: { de: "Botanisch" },
      palettes: [{ id: "salbei", name: { de: "Salbei" }, colors: { background: "#f5f6f0", surface: "#ffffff", text: "#26302a", muted: "#5f6d63", primary: "#56735f", accent: "#b8935a" } }],
      fonts: { defaultPairing: "klassisch" },
      assets: { preview: "preview.svg" },
      cards: { layouts: [{ id: "voll", name: { de: "Vollbild" }, photo: "full" }] },
    },
    "salbei",
  );
  if (!parsed.ok) throw new Error("fixture");
  const design = { ...resolveDesign(parsed.value, null, null), layout: parsed.value.cards!.layouts[0]! };
  const labels: CardLabels = {
    locale: "de",
    eyebrow: { saveTheDate: "Save the Date", invitation: "Einladung", thankYou: "Danke", engagement: "Verlobt" },
    replyBy: "Bitte antwortet bis {date}",
    time: "{time} Uhr",
    dateTbd: "Datum folgt",
  };
  const website = { title: "Anna & Ben", weddingDate: "2027-06-12", location: "Hamburg", url: "http://localhost:3000/anna-ben" };
  const assets = { photoSrc: "/uploads/p.webp", maskSvg: null, ornamentSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>' };

  it("builds a Save the Date from the wedding, with the couple's own line above the names", () => {
    const content = { ...defaultCardContent("saveTheDate", { title: "Anna & Ben", location: "Hamburg" }, { heading: "Haltet euch den Tag frei", text: "Einladung folgt" }) };
    const model = buildCardModel({ kind: "saveTheDate", content, design, website, event: null, replyBy: null, household: null, labels, assets });
    expect(model).toMatchObject({ eyebrow: "Haltet euch den Tag frei", heading: "", names: "Anna & Ben", details: ["12. Juni 2027", "Hamburg"], text: "Einladung folgt", footer: null, personalLine: null });
    expect(buildCardModel({ kind: "saveTheDate", content: { ...content, heading: "Save the Date" }, design, website, event: null, replyBy: null, household: null, labels, assets }).eyebrow).toBe("Save the Date");
    expect(model.colors.onCard).toBe("#ffffff");
    // On a full-bleed photo the ornament is drawn in the text colour, not the accent.
    expect(atob(model.ornamentSrc!.split(",")[1]!)).toContain('fill="#ffffff"');
  });

  it("builds an invitation with the event's time and venue, overridable, and the reply-by date", () => {
    const content = { ...defaultCardContent("invitation", { title: "Anna & Ben", location: null }, { heading: "Wir heiraten", text: "" }), eventId: "e1" };
    const event = { startDate: "2027-06-12", startTime: "14:30", venueName: "Gut Kaden" };
    const model = buildCardModel({ kind: "invitation", content, design, website, event, replyBy: "2027-05-01", household: null, labels, assets });
    expect(model.details).toEqual(["12. Juni 2027", "14:30 Uhr", "Gut Kaden"]);
    expect(model.footer).toBe("Bitte antwortet bis 1. Mai 2027");
    const custom = buildCardModel({ kind: "invitation", content: { ...content, time: "ab 14 Uhr", venue: "Im Garten", showReplyBy: false }, design, website, event, replyBy: "2027-05-01", household: null, labels, assets });
    expect(custom.details).toEqual(["12. Juni 2027", "ab 14 Uhr", "Im Garten"]);
    expect(custom.footer).toBeNull();
  });

  it("says \"Datum folgt\" on a Save the Date or invitation while the wedding has no date", () => {
    const open = { ...website, weddingDate: null };
    const std = defaultCardContent("saveTheDate", { title: "Anna & Ben", location: null }, { heading: "Haltet euch den Tag frei", text: "" });
    expect(buildCardModel({ kind: "saveTheDate", content: std, design, website: open, event: null, replyBy: null, household: null, labels, assets }).details).toEqual(["Datum folgt"]);
    const invitation = defaultCardContent("invitation", { title: "Anna & Ben", location: null }, { heading: "Wir heiraten", text: "" });
    expect(buildCardModel({ kind: "invitation", content: invitation, design, website: open, event: null, replyBy: null, household: null, labels, assets }).details).toEqual(["Datum folgt"]);
  });

  it("adds the household's personal line to a thank-you card", () => {
    const content = defaultCardContent("thankYou", { title: "Anna & Ben", location: null }, { heading: "Danke!", text: "Für alles." });
    const model = buildCardModel({ kind: "thankYou", content, design, website, event: null, replyBy: null, household: { name: "Familie Weber", personalLine: "Danke für den Kuchen!" }, labels, assets });
    expect(model).toMatchObject({ heading: "Danke!", text: "Für alles.", personalLine: "Danke für den Kuchen!" });
  });

  it("never shows a website address on the engagement announcement", () => {
    const content = defaultCardContent("engagement", { title: "Anna & Ben", location: null }, { heading: "Wir haben uns verlobt", text: "" });
    expect(buildCardModel({ kind: "engagement", content, design, website, event: null, replyBy: null, household: null, labels, assets }).footer).toBeNull();
  });
});

describe("followWeddingDetails", () => {
  const content = { ...defaultCardContent("saveTheDate", { title: "A & B", location: null }, { heading: "", text: "" }) };
  it("updates names and an empty or unchanged place, and keeps the couple's own texts", () => {
    expect(followWeddingDetails("saveTheDate", content, { title: "A & B", location: null }, { title: "A & B", location: "Ort" })).toMatchObject({ names: "A & B", place: "Ort" });
    expect(followWeddingDetails("saveTheDate", { ...content, place: "Eigener Ort" }, { title: "A & B", location: null }, { title: "C & D", location: "Ort" })).toMatchObject({ names: "C & D", place: "Eigener Ort" });
    expect(followWeddingDetails("thankYou", { ...content, names: "Wir" }, { title: "A & B", location: null }, { title: "C & D", location: "Ort" })).toBeNull();
    expect(followWeddingDetails("saveTheDate", content, { title: "A & B", location: null }, { title: "A & B", location: null })).toBeNull();
  });
});
