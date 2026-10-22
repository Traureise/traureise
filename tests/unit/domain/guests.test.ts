import { describe, expect, it } from "vitest";
import {
  DEFAULT_RSVP_SETTINGS,
  csvCell,
  dailySummaryDue,
  guestOverview,
  guestsCsv,
  householdEvents,
  householdStatus,
  isReplyOpen,
  mealApplies,
  householdEmails,
  parseHouseholdInput,
  parsePoll,
  parseResponse,
  parseRsvpSettings,
  rsvpEvents,
  whatsappUrl,
  type Guest,
  type Household,
  type Poll,
  type RsvpEvent,
} from "@/domain/guests";

const events: RsvpEvent[] = [
  { id: "party", name: "Feier", startDate: "2027-06-12", startTime: "18:00" },
  { id: "ceremony", name: "Trauung", startDate: "2027-06-12", startTime: "14:00" },
  { id: "brunch", name: "Brunch", startDate: "2027-06-13", startTime: "11:00" },
];

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: "g1",
  name: "Clara",
  isChild: false,
  attending: null,
  eventIds: [],
  mealOptionId: null,
  allergies: "",
  pollAnswers: {},
  fromRequest: false,
  email: null,
  ...over,
});

const household = (over: Partial<Household> = {}): Household => ({
  id: "h1",
  name: "Familie Weber",
  invitedEventIds: null,
  message: "",
  pollAnswers: {},
  respondedAt: null,
  answeredBy: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  personalLine: "",
  unsubscribedAt: null,
  people: [guest()],
  requests: [],
  ...over,
});

const musicPoll: Poll = {
  id: "music",
  question: "Musikwunsch?",
  multiple: true,
  allowOther: true,
  per: "person",
  options: [
    { id: "pop", label: "Pop" },
    { id: "jazz", label: "Jazz" },
  ],
};
const shuttlePoll: Poll = {
  id: "shuttle",
  question: "Shuttle?",
  multiple: false,
  allowOther: false,
  per: "household",
  options: [
    { id: "yes", label: "Ja" },
    { id: "no", label: "Nein" },
  ],
};
const meal = { eventId: "party", options: [{ id: "fish", label: "Fisch" }, { id: "veg", label: "Vegetarisch" }] };

describe("events", () => {
  it("offers the chosen schedule items in date order, all by default", () => {
    expect(rsvpEvents(DEFAULT_RSVP_SETTINGS, events).map((e) => e.id)).toEqual(["ceremony", "party", "brunch"]);
    expect(rsvpEvents({ ...DEFAULT_RSVP_SETTINGS, eventIds: ["brunch", "party", "gone"] }, events).map((e) => e.id)).toEqual(["party", "brunch"]);
  });

  it("shows a household only the events it is invited to", () => {
    expect(householdEvents(household(), events).map((e) => e.id)).toEqual(["party", "ceremony", "brunch"]);
    expect(householdEvents(household({ invitedEventIds: ["party"] }), events).map((e) => e.id)).toEqual(["party"]);
  });

  it("asks for the meal only when the household is invited to its event", () => {
    expect(mealApplies(meal, ["party", "brunch"])).toBe(true);
    expect(mealApplies(meal, ["brunch"])).toBe(false);
    expect(mealApplies({ eventId: null, options: meal.options }, [])).toBe(true);
    expect(mealApplies({ eventId: null, options: [] }, ["party"])).toBe(false);
    expect(mealApplies(null, ["party"])).toBe(false);
  });
});

describe("householdStatus", () => {
  it("is open until answered, then answered or declined", () => {
    expect(householdStatus(household())).toBe("open");
    const at = new Date();
    expect(householdStatus(household({ respondedAt: at, people: [guest({ attending: false }), guest({ id: "g2", attending: true })] }))).toBe("answered");
    expect(householdStatus(household({ respondedAt: at, people: [guest({ attending: false })] }))).toBe("declined");
  });
});

describe("isReplyOpen", () => {
  it("stays open through the reply-by day in the website's timezone", () => {
    expect(isReplyOpen(null, "Europe/Berlin", new Date("2030-01-01T00:00:00Z"))).toBe(true);
    expect(isReplyOpen("2027-05-01", "Europe/Berlin", new Date("2027-05-01T21:59:00Z"))).toBe(true);
    expect(isReplyOpen("2027-05-01", "Europe/Berlin", new Date("2027-05-01T22:00:00Z"))).toBe(false);
  });
});

describe("parseResponse", () => {
  const two = household({ invitedEventIds: ["party", "brunch"], people: [guest(), guest({ id: "g2", name: "Max" })] });
  const ctx = { household: two, events, meal, polls: [musicPoll, shuttlePoll] };

  it("accepts a full answer and keeps only what applies", () => {
    const parsed = parseResponse(
      {
        people: {
          g1: { attending: true, eventIds: ["party"], mealOptionId: "veg", allergies: " Nüsse ", polls: { music: { optionIds: ["pop"], other: "Schlager" } } },
          g2: { attending: false, eventIds: ["party"], mealOptionId: "fish", allergies: "Laktose", polls: { music: { optionIds: ["jazz"] } } },
        },
        polls: { shuttle: { optionIds: ["yes"] } },
        message: "Wir freuen uns!",
        requests: ["Lena", " "],
      },
      ctx,
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        people: [
          { guestId: "g1", attending: true, eventIds: ["party"], mealOptionId: "veg", allergies: "Nüsse", pollAnswers: { music: { optionIds: ["pop"], other: "Schlager" } } },
          { guestId: "g2", attending: false, eventIds: [], mealOptionId: null, allergies: "", pollAnswers: {} },
        ],
        pollAnswers: { shuttle: { optionIds: ["yes"], other: null } },
        message: "Wir freuen uns!",
        requests: ["Lena"],
      },
    });
  });

  it("requires an answer per person, an event and the meal for the meal's event", () => {
    const parsed = parseResponse({ people: { g1: { attending: true, eventIds: [] }, g2: {} } }, ctx);
    expect(parsed).toEqual({ ok: false, fieldErrors: { "people.g1.eventIds": "required", "people.g2.attending": "required" } });
    const noMeal = parseResponse({ people: { g1: { attending: true, eventIds: ["party"] }, g2: { attending: false } } }, ctx);
    expect(noMeal).toEqual({ ok: false, fieldErrors: { "people.g1.mealOptionId": "required" } });
    const brunchOnly = parseResponse({ people: { g1: { attending: true, eventIds: ["brunch"] }, g2: { attending: false } } }, ctx);
    expect(brunchOnly.ok).toBe(true);
  });

  it("rejects people, events, options and polls from elsewhere", () => {
    const bad = (input: unknown) => parseResponse(input, ctx);
    expect(bad({ people: { g1: { attending: false }, g2: { attending: false }, other: { attending: true } } })).toEqual({ ok: false, fieldErrors: { people: "invalid_person" } });
    expect(bad({ people: { g1: { attending: true, eventIds: ["ceremony"] }, g2: { attending: false } } })).toEqual({ ok: false, fieldErrors: { "people.g1.eventIds": "invalid_option" } });
    expect(bad({ people: { g1: { attending: true, eventIds: ["party"], mealOptionId: "steak" }, g2: { attending: false } } })).toEqual({
      ok: false,
      fieldErrors: { "people.g1.mealOptionId": "invalid_option" },
    });
    expect(bad({ people: { g1: { attending: false }, g2: { attending: false } }, polls: { music: { optionIds: ["pop"] } } })).toEqual({ ok: false, fieldErrors: { polls: "invalid_option" } });
    expect(bad({ people: { g1: { attending: false }, g2: { attending: false } }, polls: { shuttle: { optionIds: ["yes", "no"] } } })).toEqual({
      ok: false,
      fieldErrors: { "polls.shuttle": "invalid_option" },
    });
    expect(bad({ people: { g1: { attending: false }, g2: { attending: false } }, polls: { shuttle: { optionIds: [], other: "Taxi" } } })).toEqual({
      ok: false,
      fieldErrors: { "polls.shuttle": "invalid_option" },
    });
  });

  it("limits free text", () => {
    const parsed = parseResponse({ people: { g1: { attending: false }, g2: { attending: false } }, message: "x".repeat(2001) }, ctx);
    expect(parsed).toEqual({ ok: false, fieldErrors: { message: "too_long" } });
  });
});

describe("settings, polls and households", () => {
  it("parses settings with defaults", () => {
    expect(parseRsvpSettings({ replyBy: "", notify: "each", meal: { eventId: "", options: [{ id: "a", label: " Fisch " }, { id: "", label: "" }] } })).toEqual({
      ok: true,
      value: { replyBy: null, eventIds: null, meal: { eventId: null, options: [{ id: "a", label: "Fisch" }] }, notify: "each", whatsappMessage: null },
    });
    expect(parseRsvpSettings({ replyBy: "2027-13-01", notify: "loud" })).toEqual({ ok: false, fieldErrors: { replyBy: "invalid_date", notify: "invalid_option" } });
  });

  it("needs a question and two options for a poll", () => {
    expect(parsePoll({ question: "", options: [{ id: "a", label: "A" }] })).toEqual({ ok: false, fieldErrors: { question: "required", options: "too_few_options" } });
    expect(parsePoll({ question: "Shuttle?", per: "household", options: [{ id: "a", label: "Ja" }, { id: "b", label: "Nein" }] })).toEqual({
      ok: true,
      value: { question: "Shuttle?", multiple: false, allowOther: false, per: "household", options: [{ id: "a", label: "Ja" }, { id: "b", label: "Nein" }] },
    });
  });

  it("needs a name and at least one person for a household", () => {
    expect(parseHouseholdInput({ name: "", people: [] })).toEqual({ ok: false, fieldErrors: { name: "required", people: "no_people" } });
    expect(parseHouseholdInput({ name: "Weber", invitedEventIds: null, people: [{ name: "Clara" }, { id: "g2", name: "Ida", isChild: true }, { name: " " }] })).toEqual({
      ok: true,
      value: { name: "Weber", invitedEventIds: null, personalLine: "", people: [{ id: null, name: "Clara", isChild: false, email: null }, { id: "g2", name: "Ida", isChild: true, email: null }] },
    });
  });

  it("takes an optional email address per person (normalised) and a personal line for the thank-you card", () => {
    const parsed = parseHouseholdInput({ name: "M", personalLine: " Danke für den Kuchen! ", people: [{ name: "A", email: " A@X.de " }] });
    expect(parsed).toMatchObject({ ok: true, value: { personalLine: "Danke für den Kuchen!" } });
    expect(parsed.ok && parsed.value.people[0]!.email).toBe("a@x.de");
    expect(parseHouseholdInput({ name: "M", people: [{ name: "A", email: "kein-at" }] })).toEqual({ ok: false, fieldErrors: { "people.0.email": "invalid_email" } });
    expect(parseHouseholdInput({ name: "Weber", personalLine: "x".repeat(301), people: [{ name: "Clara" }] })).toEqual({ ok: false, fieldErrors: { personalLine: "too_long" } });
  });
});

describe("guestOverview", () => {
  const at = new Date("2026-10-10T00:00:00Z");
  const households = [
    household({
      respondedAt: at,
      pollAnswers: { shuttle: { optionIds: ["yes"], other: null } },
      people: [
        guest({ attending: true, eventIds: ["party", "ceremony"], mealOptionId: "veg", allergies: "Nüsse", pollAnswers: { music: { optionIds: ["pop"], other: "Schlager" } } }),
        guest({ id: "g2", name: "Max", attending: false }),
      ],
      requests: [{ id: "r1", name: "Lena", status: "pending", createdAt: at, decidedAt: null }],
    }),
    household({ id: "h2", name: "Müller", people: [guest({ id: "g3", name: "Tom" }), guest({ id: "g4", name: "Ute" })] }),
  ];
  const view = guestOverview({ households, events, meal, polls: [musicPoll, shuttlePoll] });

  it("counts people and households", () => {
    expect(view.people).toEqual({ coming: 1, notComing: 1, open: 2 });
    expect(view.households).toEqual({ answered: 1, total: 2 });
  });

  it("counts per event, meal and poll option, and lists allergies and requests", () => {
    expect(view.events).toEqual([
      { id: "ceremony", name: "Trauung", count: 1 },
      { id: "party", name: "Feier", count: 1 },
      { id: "brunch", name: "Brunch", count: 0 },
    ]);
    expect(view.meals).toEqual([
      { id: "fish", label: "Fisch", count: 0 },
      { id: "veg", label: "Vegetarisch", count: 1 },
    ]);
    expect(view.polls).toEqual([
      { id: "music", question: "Musikwunsch?", options: [{ id: "pop", label: "Pop", count: 1 }, { id: "jazz", label: "Jazz", count: 0 }], other: ["Schlager"] },
      { id: "shuttle", question: "Shuttle?", options: [{ id: "yes", label: "Ja", count: 1 }, { id: "no", label: "Nein", count: 0 }], other: [] },
    ]);
    expect(view.allergies).toEqual([{ name: "Clara", household: "Familie Weber", allergies: "Nüsse" }]);
    expect(view.requests).toEqual([{ id: "r1", name: "Lena", householdId: "h1", household: "Familie Weber" }]);
  });
});

describe("CSV export", () => {
  it("neutralises formulas in cells", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell('Sie sagt "hallo"')).toBe(`"Sie sagt ""hallo"""`);
  });

  it("has one row per person with their answers", () => {
    const at = new Date("2026-10-10T00:00:00Z");
    const csv = guestsCsv({
      households: [
        household({
          respondedAt: at,
          message: "Bis bald",
          pollAnswers: { shuttle: { optionIds: ["yes"], other: null } },
          people: [guest({ attending: true, eventIds: ["party"], mealOptionId: "veg", allergies: "Nüsse", pollAnswers: { music: { optionIds: ["pop", "jazz"], other: "Schlager" } } })],
        }),
        household({ id: "h2", name: "Müller", people: [guest({ id: "g3", name: "Tom", isChild: true })] }),
      ],
      events,
      meal,
      polls: [musicPoll, shuttlePoll],
      labels: { household: "Haushalt", name: "Name", child: "Kind", status: "Status", meal: "Essen", allergies: "Allergien", message: "Nachricht", yes: "ja", no: "nein", statuses: { coming: "kommt", notComing: "kommt nicht", open: "offen" } },
    });
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(`"Haushalt";"Name";"Kind";"Status";"Trauung";"Feier";"Brunch";"Essen";"Allergien";"Musikwunsch?";"Shuttle?";"Nachricht"`);
    expect(lines[1]).toBe(`"Familie Weber";"Clara";"nein";"kommt";"nein";"ja";"nein";"Vegetarisch";"Nüsse";"Pop, Jazz, Schlager";"Ja";"Bis bald"`);
    expect(lines[2]).toBe(`"Müller";"Tom";"ja";"offen";"";"";"";"";"";"";"";""`);
  });
});

describe("whatsappUrl", () => {
  it("prefills a message with the household's name and link", () => {
    const url = whatsappUrl("Hallo {name}, sagt uns Bescheid:", "Familie Weber", "https://example.org/antwort/abc");
    expect(url).toBe(`https://wa.me/?text=${encodeURIComponent("Hallo Familie Weber, sagt uns Bescheid:\nhttps://example.org/antwort/abc")}`);
  });
});

describe("dailySummaryDue", () => {
  it("is due once a day from 8:00 in the website's timezone", () => {
    const tz = "Europe/Berlin";
    expect(dailySummaryDue(null, tz, new Date("2027-05-02T05:59:00Z"))).toBe(false);
    expect(dailySummaryDue(null, tz, new Date("2027-05-02T06:00:00Z"))).toBe(true);
    expect(dailySummaryDue(new Date("2027-05-02T06:00:00Z"), tz, new Date("2027-05-02T20:00:00Z"))).toBe(false);
    expect(dailySummaryDue(new Date("2027-05-02T06:00:00Z"), tz, new Date("2027-05-03T06:30:00Z"))).toBe(true);
  });
});

describe("householdEmails", () => {
  it("lists the distinct addresses of the people, in person order", () => {
    const people = [guest({ email: "a@x.de" }), guest({ email: null }), guest({ email: "a@x.de" }), guest({ email: "b@x.de" })];
    expect(householdEmails({ people })).toEqual(["a@x.de", "b@x.de"]);
    expect(householdEmails({ people: [guest()] })).toEqual([]);
  });
});
