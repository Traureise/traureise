import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ExportAccount } from "@/application/account";
import type { Deps } from "@/application/deps";
import { ExportGuestsCsv, RunGuestJobs, SaveHousehold, SubmitGuestResponse } from "@/application/guests";
import type { Section } from "@/application/ports";
import type { CsvLabels } from "@/domain/guests";
import { SECTION_KINDS } from "@/domain/sections";
import { FflateArchiveWriter } from "@/infrastructure/archive/zip";
import { guestRequests, guests, households, rsvpPolls, rsvpSettings } from "@/infrastructure/db/schema";
import { createGuestMailTemplates } from "@/infrastructure/mail/guest-templates";
import { PostgresRateLimiter } from "@/infrastructure/repositories/auth";
import { DrizzleBillingRepository } from "@/infrastructure/repositories/billing";
import { DrizzleCardRepository } from "@/infrastructure/repositories/cards";
import { DrizzleGuestRepository } from "@/infrastructure/repositories/guests";
import { createCardTexts } from "@/infrastructure/mail/card-templates";
import { DrizzleUploadRepository } from "@/infrastructure/repositories/uploads";
import { DrizzleUserRepository } from "@/infrastructure/repositories/users";
import { DrizzleWebsiteRepository } from "@/infrastructure/repositories/websites";
import { cryptoTokens, hmacGuestLinks } from "@/infrastructure/system";
import { FakeClock, FakeMailer, FakeThemes, InMemoryStorage } from "../fakes";
import { setupTestDatabase } from "./db";

const db = setupTestDatabase();
const sections: Section[] = SECTION_KINDS.map((kind) => ({ kind, title: null, visible: true, body: "" }));
const repo = new DrizzleGuestRepository(db);
const users = new DrizzleUserRepository(db);
const websites = new DrizzleWebsiteRepository(db);

let websiteId: string;
let ownerId: string;
let party: string;

beforeEach(async () => {
  ownerId = (await users.create("anna@example.org")).id;
  websiteId = (await websites.create({ ownerId, slug: `anna-${Date.now()}`, title: "Anna & Ben", weddingDate: "2027-06-12", themeId: "salbei", timezone: "Europe/Berlin" }, sections)).id;
  party = (await websites.addItem(websiteId, "schedule", { imageKey: null, eventType: "reception", name: "Feier", startDate: "2027-06-12", startTime: "18:00", endDate: null, endTime: null, venueName: "", address: "", description: "", website: null })).id;
});

/** Real repositories and templates; only the clock, mailer, storage and themes are fakes. */
function deps(clock = new FakeClock()) {
  const mailer = new FakeMailer();
  const value = {
    users,
    websites,
    uploads: new DrizzleUploadRepository(db),
    storage: new InMemoryStorage(),
    billingRepo: new DrizzleBillingRepository(db),
    rateLimiter: new PostgresRateLimiter(db),
    guests: repo,
    cards: new DrizzleCardRepository(db),
    cardTexts: createCardTexts(),
    mailRate: { batchSize: 10, intervalMs: 0 },
    guestLinks: hmacGuestLinks("integration-secret-integration-secret"),
    guestMail: createGuestMailTemplates(),
    mailer,
    themes: new FakeThemes(),
    clock,
    tokens: cryptoTokens,
    archive: new FflateArchiveWriter(),
    billing: { enabled: false, offers: [], unlockedTiers: [] },
    payments: null,
    appUrl: "http://localhost:3000",
  } as unknown as Deps;
  return { deps: value, mailer, clock };
}

const newHousehold = (name = "Familie Weber", people = ["Clara", "Max"]) =>
  repo.createHousehold(websiteId, { name, invitedEventIds: null, email: null, personalLine: "", people: people.map((p) => ({ id: null, name: p, isChild: p === "Ida" })) }, (id) => `hash-${id}`);

describe("DrizzleGuestRepository", () => {
  it("stores settings and polls per website", async () => {
    expect(await repo.getSettings(websiteId)).toEqual({ replyBy: null, eventIds: null, meal: null, notify: "off", whatsappMessage: null });
    const settings = { replyBy: "2027-05-01", eventIds: [party], meal: { eventId: party, options: [{ id: "fish", label: "Fisch" }] }, notify: "daily" as const, whatsappMessage: "Hallo {name}" };
    await repo.saveSettings(websiteId, settings);
    await repo.saveSettings(websiteId, settings);
    expect(await repo.getSettings(websiteId)).toEqual(settings);

    const a = await repo.createPoll(websiteId, { question: "Musik?", multiple: true, allowOther: true, per: "person", options: [{ id: "a", label: "Pop" }, { id: "b", label: "Jazz" }] });
    const b = await repo.createPoll(websiteId, { question: "Shuttle?", multiple: false, allowOther: false, per: "household", options: [{ id: "y", label: "Ja" }, { id: "n", label: "Nein" }] });
    expect([a.position, b.position]).toEqual([0, 1]);
    expect(await repo.updatePoll(websiteId, a.id, { question: "Musikwunsch?", multiple: true, allowOther: false, per: "person", options: a.options })).toBe(true);
    expect(await repo.updatePoll(crypto.randomUUID(), a.id, { ...a })).toBe(false);
    await repo.deletePoll(websiteId, b.id);
    expect((await repo.listPolls(websiteId)).map((p) => p.question)).toEqual(["Musikwunsch?"]);
  });

  it("keeps households with people in order, finds them by token hash only, and updates people in place", async () => {
    const household = await newHousehold();
    expect(household.people.map((p) => p.name)).toEqual(["Clara", "Max"]);
    expect(await repo.findByTokenHash(`hash-${household.id}`)).toMatchObject({ websiteId, household: { id: household.id } });
    expect(await repo.findByTokenHash("nope")).toBeNull();
    expect(await repo.findHousehold(crypto.randomUUID(), household.id)).toBeNull();

    const [clara] = household.people;
    await repo.updateHousehold(websiteId, household.id, { name: "Weber", invitedEventIds: [party], email: null, personalLine: "", people: [{ id: null, name: "Ida", isChild: true }, { id: clara!.id, name: "Clara W.", isChild: false }] });
    const updated = (await repo.findHousehold(websiteId, household.id))!;
    expect(updated).toMatchObject({ name: "Weber", invitedEventIds: [party] });
    expect(updated.people.map((p) => [p.name, p.isChild, p.id === clara!.id])).toEqual([
      ["Ida", true, false],
      ["Clara W.", false, true],
    ]);
  });

  it("saves answers and requests, and adds a requested guest exactly once", async () => {
    const household = await newHousehold();
    const [clara, max] = household.people;
    const at = new Date("2026-10-18T10:00:00Z");
    await repo.saveResponse(
      household.id,
      {
        people: [
          { guestId: clara!.id, attending: true, eventIds: [party], mealOptionId: "fish", allergies: "Nüsse", pollAnswers: { p: { optionIds: ["a"], other: null } } },
          { guestId: max!.id, attending: false, eventIds: [], mealOptionId: null, allergies: "", pollAnswers: {} },
        ],
        pollAnswers: { s: { optionIds: [], other: "Taxi" } },
        message: "Bis bald",
        requests: ["Lena"],
      },
      at,
    );
    const saved = (await repo.findHousehold(websiteId, household.id))!;
    expect(saved).toMatchObject({ message: "Bis bald", respondedAt: at, pollAnswers: { s: { optionIds: [], other: "Taxi" } } });
    expect(saved.people[0]).toMatchObject({ attending: true, eventIds: [party], mealOptionId: "fish", allergies: "Nüsse" });
    const [request] = saved.requests;
    expect(request).toMatchObject({ name: "Lena", status: "pending" });

    expect(await repo.decideRequest(crypto.randomUUID(), request!.id, "added", at)).toBe(false);
    expect(await repo.decideRequest(websiteId, request!.id, "added", at)).toBe(true);
    expect(await repo.decideRequest(websiteId, request!.id, "added", at)).toBe(false);
    const after = (await repo.findHousehold(websiteId, household.id))!;
    expect(after.people.map((p) => [p.name, p.fromRequest])).toEqual([
      ["Clara", false],
      ["Max", false],
      ["Lena", true],
    ]);
    expect(after.requests[0]).toMatchObject({ status: "added", decidedAt: at });
  });

  it("claims daily summaries and retention warnings once", async () => {
    await repo.saveSettings(websiteId, { replyBy: null, eventIds: null, meal: null, notify: "daily", whatsappMessage: null });
    expect(await repo.listWebsiteIdsWithDailySummary()).toEqual([websiteId]);
    const first = new Date("2026-10-18T06:00:00Z");
    expect(await repo.claimDailySummary(websiteId, null, first)).toBe(true);
    expect(await repo.claimDailySummary(websiteId, null, first)).toBe(false);
    expect(await repo.lastSummaryAt(websiteId)).toEqual(first);
    expect(await repo.claimDailySummary(websiteId, first, new Date("2026-10-19T06:00:00Z"))).toBe(true);

    const deleteAt = new Date("2028-06-13T00:00:00Z");
    expect(await repo.claimRetentionWarning(websiteId, deleteAt)).toBe(true);
    expect(await repo.claimRetentionWarning(websiteId, deleteAt)).toBe(false);
    expect(await repo.claimRetentionWarning(websiteId, new Date("2029-01-01T00:00:00Z"))).toBe(true);
    // A website without settings yet can be claimed too.
    const other = (await websites.create({ ownerId, slug: `zwei-${Date.now()}`, title: "Zwei", weddingDate: null, themeId: "salbei", timezone: "Europe/Berlin" }, sections)).id;
    expect(await repo.claimRetentionWarning(other, deleteAt)).toBe(true);
  });

  it("removes every guest row with the website and with the account", async () => {
    const household = await newHousehold();
    await repo.saveResponse(household.id, { people: [], pollAnswers: {}, message: "", requests: ["Lena"] }, new Date());
    await repo.saveSettings(websiteId, { replyBy: null, eventIds: null, meal: null, notify: "off", whatsappMessage: null });
    await repo.createPoll(websiteId, { question: "Q", multiple: false, allowOther: false, per: "person", options: [] });
    await websites.delete(websiteId);
    const counts = await Promise.all([
      db.$count(households),
      db.$count(guests),
      db.$count(guestRequests),
      db.$count(rsvpPolls),
      db.$count(rsvpSettings),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("retention", () => {
  it("deletes households, people, answers and requests after the package end, and nothing of other websites", async () => {
    const { deps: d, clock } = deps();
    const household = await newHousehold();
    await repo.saveResponse(household.id, { people: [], pollAnswers: {}, message: "Hallo", requests: ["Lena"] }, new Date());
    const otherSite = (await websites.create({ ownerId, slug: `spaet-${Date.now()}`, title: "Später", weddingDate: "2030-01-01", themeId: "salbei", timezone: "Europe/Berlin" }, sections)).id;
    await repo.createHousehold(otherSite, { name: "Bleibt", invitedEventIds: null, email: null, personalLine: "", people: [{ id: null, name: "Tom", isChild: false }] }, (id) => `hash-${id}`);
    const ids = [household.id];

    clock.current = new Date("2028-06-13T00:00:01Z");
    const result = await new RunGuestJobs(d).execute();
    expect(result.deleted).toEqual([websiteId]);
    expect(await db.$count(households, eq(households.websiteId, websiteId))).toBe(0);
    expect(await db.$count(guests, inArray(guests.householdId, ids))).toBe(0);
    expect(await db.$count(guestRequests, inArray(guestRequests.householdId, ids))).toBe(0);
    expect(await db.$count(households, eq(households.websiteId, otherSite))).toBe(1);
    expect((await new RunGuestJobs(d).execute()).deleted).toEqual([]);
  });

  it("warns once by email, from two job runs at the same time", async () => {
    const { deps: d, clock, mailer } = deps();
    await newHousehold();
    clock.current = new Date("2028-05-20T10:00:00Z");
    const runs = await Promise.all([new RunGuestJobs(d).execute(), new RunGuestJobs(d).execute()]);
    expect(runs.flatMap((r) => r.warned)).toEqual([websiteId]);
    expect(mailer.sent.map((m) => [m.to, m.subject])).toEqual([["anna@example.org", "Eure Gästeliste wird am 13. Juni 2028 gelöscht"]]);
  });
});

describe("CSV export and account export", () => {
  const labels: CsvLabels = { household: "Haushalt", name: "Name", child: "Kind", status: "Status", meal: "Essen", allergies: "Allergien", message: "Nachricht", yes: "ja", no: "nein", statuses: { coming: "kommt", notComing: "kommt nicht", open: "offen" } };

  it("exports every person with their answers", async () => {
    const { deps: d } = deps();
    const weber = await new SaveHousehold(d).execute(ownerId, websiteId, null, { name: "Familie Weber", people: [{ name: "Clara" }, { name: "Max" }] });
    await new SaveHousehold(d).execute(ownerId, websiteId, null, { name: "Müller", people: [{ name: "=Tom" }] });
    const token = d.guestLinks.tokenFor(weber.id);
    await new SubmitGuestResponse(d).execute({
      token,
      ip: "10.1.1.1",
      input: { people: { [weber.people[0]!.id]: { attending: true, eventIds: [party], allergies: "Nüsse" }, [weber.people[1]!.id]: { attending: false } }, message: "Bis bald" },
    });
    const { csv } = await new ExportGuestsCsv(d).execute(ownerId, websiteId, labels);
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines).toEqual([
      `"Haushalt";"Name";"Kind";"Status";"Feier";"Allergien";"Nachricht"`,
      `"Familie Weber";"Clara";"nein";"kommt";"ja";"Nüsse";"Bis bald"`,
      `"Familie Weber";"Max";"nein";"kommt nicht";"nein";"";"Bis bald"`,
      `"Müller";"'=Tom";"nein";"offen";"";"";""`,
    ]);
  });

  it("puts the guest list into data.json, without link hashes", async () => {
    const { deps: d } = deps();
    await new SaveHousehold(d).execute(ownerId, websiteId, null, { name: "Familie Weber", people: [{ name: "Clara" }] });
    const { unzipSync } = await import("fflate");
    const zip = unzipSync((await new ExportAccount(d).execute(ownerId)).bytes);
    const json = new TextDecoder().decode(zip["data.json"]);
    const data = JSON.parse(json);
    expect(data.websites[0].guests.households[0]).toMatchObject({ name: "Familie Weber", people: [{ name: "Clara", attending: null }] });
    const [row] = await db.select({ hash: households.tokenHash }).from(households);
    expect(json).not.toContain(row!.hash);
  });
});
