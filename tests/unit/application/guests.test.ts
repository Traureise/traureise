import { beforeEach, describe, expect, it } from "vitest";
import { DeleteAccount, ExportAccount } from "@/application/account";
import { NotFoundError, RateLimitedError, ValidationError } from "@/application/errors";
import {
  DecideGuestRequest,
  DeleteHousehold,
  DeletePoll,
  ExportGuestsCsv,
  GetGuestFormPreview,
  GetGuestPage,
  RunGuestJobs,
  SaveHousehold,
  SavePoll,
  SaveRsvpSettings,
  SubmitGuestResponse,
} from "@/application/guests";
import { GetHouseholdPage } from "@/application/cards";
import { AddItem } from "@/application/sections";
import { CreateWebsite, DeleteWebsite } from "@/application/websites";
import type { CsvLabels } from "@/domain/guests";
import { FakeArchive, createFakes } from "../../fakes";

let f: ReturnType<typeof createFakes>;
let anna: { id: string; email: string };
let websiteId: string;
let party: string;
let brunch: string;

const event = (name: string, startDate: string, startTime: string) => ({ eventType: "reception", name, startDate, startTime });

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  anna = await f.users.create("anna@example.org");
  websiteId = (await new CreateWebsite(f.deps).execute(anna.id, { title: "Anna & Ben", weddingDate: "2027-06-12" })).id;
  party = (await new AddItem(f.deps).execute(anna.id, websiteId, "schedule", event("Feier", "2027-06-12", "18:00"))).id;
  brunch = (await new AddItem(f.deps).execute(anna.id, websiteId, "schedule", event("Brunch", "2027-06-13", "11:00"))).id;
});

const saveHousehold = (input: unknown, householdId: string | null = null, userId = anna.id) =>
  new SaveHousehold(f.deps).execute(userId, websiteId, householdId, input);
const page = () => new GetGuestPage(f.deps).execute(anna.id, websiteId);
const submit = (token: string, input: unknown, ip = "10.0.0.1") => new SubmitGuestResponse(f.deps).execute({ token, input, ip });
const tokenOf = (householdId: string) => f.guestLinks.tokenFor(householdId);
/** The response form on a household's page (without cards the page is just the form), or the inactive page. */
const guestForm = async (token: string) => {
  const result = await new GetHouseholdPage(f.deps).execute(token);
  return result?.state === "page" ? result.form : result;
};
const grantRsvp = async (over: { validUntil?: Date } = {}) => {
  f.deps.billing.enabled = true;
  await f.billingRepo.applyEvent(`evt-${Math.random()}`, {
    kind: "grant",
    websiteId,
    tier: "rsvp",
    purchaseRef: `ord-${Math.random()}`,
    provider: "testpay",
    validUntil: over.validUntil ?? new Date("2028-06-13T00:00:00Z"),
  });
};

async function weber() {
  return saveHousehold({ name: "Familie Weber", people: [{ name: "Clara" }, { name: "Max" }] });
}

describe("guest list", () => {
  it("adds, edits and deletes households with people", async () => {
    const created = await weber();
    expect(created.people.map((p) => p.name)).toEqual(["Clara", "Max"]);

    const [clara] = created.people;
    await saveHousehold({ name: "Weber", invitedEventIds: [party, "unknown"], people: [{ id: clara!.id, name: "Clara W." }, { name: "Ida", isChild: true }] }, created.id);
    const [entry] = (await page()).households;
    expect(entry).toMatchObject({ name: "Weber", invitedEventIds: [party], status: "open" });
    expect(entry!.people.map((p) => [p.id === clara!.id, p.name, p.isChild])).toEqual([
      [true, "Clara W.", false],
      [false, "Ida", true],
    ]);

    await new DeleteHousehold(f.deps).execute(anna.id, websiteId, created.id);
    expect((await page()).households).toEqual([]);
  });

  it("validates input and refuses people of other households", async () => {
    await expect(saveHousehold({ name: "", people: [] })).rejects.toBeInstanceOf(ValidationError);
    const a = await weber();
    const b = await saveHousehold({ name: "Müller", people: [{ name: "Tom" }] });
    await expect(saveHousehold({ name: "Weber", people: [{ id: b.people[0]!.id, name: "Tom" }] }, a.id)).rejects.toMatchObject({ fieldErrors: { people: "invalid_person" } });
  });

  it("belongs to the website's owner only", async () => {
    const eve = await f.users.create("eve@example.org");
    await expect(saveHousehold({ name: "Eve", people: [{ name: "Eve" }] }, null, eve.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new GetGuestPage(f.deps).execute(eve.id, websiteId)).rejects.toBeInstanceOf(NotFoundError);
    const household = await weber();
    await expect(new DeleteHousehold(f.deps).execute(eve.id, websiteId, household.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("RSVP settings and polls", () => {
  it("saves settings, gives new options ids and refuses unknown events", async () => {
    await new SaveRsvpSettings(f.deps).execute(anna.id, websiteId, {
      replyBy: "2027-05-01",
      eventIds: [party],
      meal: { eventId: party, options: [{ label: "Fisch" }, { label: "Vegetarisch" }] },
      notify: "each",
    });
    const { settings, events } = await page();
    expect(settings).toMatchObject({ replyBy: "2027-05-01", eventIds: [party], notify: "each" });
    expect(settings.meal!.options.map((o) => o.label)).toEqual(["Fisch", "Vegetarisch"]);
    expect(settings.meal!.options.every((o) => o.id.length > 0)).toBe(true);
    expect(events.map((e) => e.name)).toEqual(["Feier"]);

    await expect(new SaveRsvpSettings(f.deps).execute(anna.id, websiteId, { eventIds: ["nope"] })).rejects.toMatchObject({ fieldErrors: { eventIds: "invalid_option" } });
    await expect(new SaveRsvpSettings(f.deps).execute(anna.id, websiteId, { meal: { eventId: "nope", options: [{ label: "A" }] } })).rejects.toMatchObject({
      fieldErrors: { "meal.eventId": "invalid_option" },
    });
  });

  it("creates, edits and deletes polls, keeping option ids", async () => {
    const poll = await new SavePoll(f.deps).execute(anna.id, websiteId, null, { question: "Musik?", multiple: true, options: [{ label: "Pop" }, { label: "Jazz" }] });
    const [pop] = poll.options;
    await new SavePoll(f.deps).execute(anna.id, websiteId, poll.id, { question: "Musikwunsch?", options: [{ id: pop!.id, label: "Pop" }, { label: "Rock" }] });
    const [saved] = (await page()).polls;
    expect(saved).toMatchObject({ question: "Musikwunsch?", multiple: false });
    expect(saved!.options[0]!.id).toBe(pop!.id);
    expect(saved!.options[1]!.label).toBe("Rock");
    await expect(new SavePoll(f.deps).execute(anna.id, websiteId, "poll-x", { question: "X", options: [{ label: "A" }, { label: "B" }] })).rejects.toBeInstanceOf(NotFoundError);
    await new DeletePoll(f.deps).execute(anna.id, websiteId, poll.id);
    expect((await page()).polls).toEqual([]);
  });
});

describe("sending is the RSVP tier", () => {
  it("shows links without billing (self-hosted)", async () => {
    const household = await weber();
    const view = await page();
    expect(view.sending).toBe(true);
    expect(view.households[0]!.link).toBe(`http://localhost:3000/antwort/${tokenOf(household.id)}`);
  });

  it("hides links and keeps them inactive until the package is bought", async () => {
    f.deps.billing.enabled = true;
    const household = await weber();
    const view = await page();
    expect(view.sending).toBe(false);
    expect(view.households[0]!.link).toBeNull();
    expect(await guestForm(tokenOf(household.id))).toMatchObject({ state: "inactive" });
    await expect(submit(tokenOf(household.id), {})).rejects.toMatchObject({ fieldErrors: { _: "inactive" } });

    await grantRsvp();
    expect((await page()).sending).toBe(true);
    expect(await guestForm(tokenOf(household.id))).toMatchObject({ state: "open" });
  });
});

describe("the guest form", () => {
  it("is a 404 for unknown tokens and hides everything when inactive", async () => {
    expect(await guestForm("nope")).toBeNull();
    await expect(submit("nope", {})).rejects.toBeInstanceOf(NotFoundError);
    f.deps.billing.enabled = true;
    const household = await weber();
    expect(await guestForm(tokenOf(household.id))).not.toHaveProperty("household");
  });

  it("shows only the household's events and the meal only when it applies", async () => {
    await new SaveRsvpSettings(f.deps).execute(anna.id, websiteId, { meal: { eventId: party, options: [{ label: "Fisch" }] } });
    const brunchOnly = await saveHousehold({ name: "Brunch", invitedEventIds: [brunch], people: [{ name: "Ute" }] });
    const all = await weber();
    const brunchForm = await guestForm(tokenOf(brunchOnly.id));
    expect(brunchForm).toMatchObject({ state: "open", meal: null });
    expect(brunchForm!.state === "open" && brunchForm!.events.map((e) => e.name)).toEqual(["Brunch"]);
    const allForm = await guestForm(tokenOf(all.id));
    expect(allForm!.state === "open" && allForm!.events.map((e) => e.name)).toEqual(["Feier", "Brunch"]);
    expect(allForm!.state === "open" && allForm!.meal?.options.map((o) => o.label)).toEqual(["Fisch"]);
  });

  it("saves an answer, can change it, and closes after the reply-by date", async () => {
    await new SaveRsvpSettings(f.deps).execute(anna.id, websiteId, { replyBy: "2026-10-20" });
    const household = await weber();
    const [clara, max] = household.people;
    await submit(tokenOf(household.id), {
      people: { [clara!.id]: { attending: true, eventIds: [party], allergies: "Nüsse" }, [max!.id]: { attending: false } },
      message: "Wir freuen uns",
      requests: ["Lena"],
    });
    let view = await page();
    expect(view.households[0]).toMatchObject({ status: "answered", message: "Wir freuen uns" });
    expect(view.overview.people).toEqual({ coming: 1, notComing: 1, open: 0 });
    expect(view.overview.requests.map((r) => r.name)).toEqual(["Lena"]);

    await submit(tokenOf(household.id), { people: { [clara!.id]: { attending: false }, [max!.id]: { attending: false } } });
    view = await page();
    expect(view.households[0]!.status).toBe("declined");
    expect(view.overview.requests.map((r) => r.name)).toEqual(["Lena"]);

    f.clock.advance(3 * 86_400_000);
    expect(await guestForm(tokenOf(household.id))).toMatchObject({ state: "closed" });
    await expect(submit(tokenOf(household.id), { people: { [clara!.id]: { attending: true, eventIds: [party] }, [max!.id]: { attending: false } } })).rejects.toMatchObject({
      fieldErrors: { _: "closed" },
    });
  });

  it("changes only the household behind the token", async () => {
    const a = await weber();
    const b = await saveHousehold({ name: "Müller", people: [{ name: "Tom" }] });
    await expect(submit(tokenOf(a.id), { people: { [b.people[0]!.id]: { attending: true, eventIds: [party] } } })).rejects.toBeInstanceOf(ValidationError);
    expect((await page()).households.find((h) => h.id === b.id)!.people[0]!.attending).toBeNull();
  });

  it("is rate-limited", async () => {
    const household = await weber();
    const input = { people: Object.fromEntries(household.people.map((p) => [p.id, { attending: false }])) };
    for (let i = 0; i < 20; i++) await submit(tokenOf(household.id), input);
    await expect(submit(tokenOf(household.id), input)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("emails the couple per answer when they asked for it, and a failing mail never fails the answer", async () => {
    await new SaveRsvpSettings(f.deps).execute(anna.id, websiteId, { notify: "each" });
    const household = await weber();
    const input = { people: { [household.people[0]!.id]: { attending: true, eventIds: [party] }, [household.people[1]!.id]: { attending: false } } };
    await submit(tokenOf(household.id), input);
    expect(f.mailer.sent).toHaveLength(1);
    expect(f.mailer.sent[0]).toMatchObject({ to: "anna@example.org", subject: "Antwort: Familie Weber" });
    expect(JSON.parse(f.mailer.sent[0]!.text)).toMatchObject({ coming: ["Clara"], notComing: ["Max"], guestsUrl: `http://localhost:3000/websites/${websiteId}/gaeste` });

    f.mailer.send = async () => {
      throw new Error("smtp down");
    };
    await expect(submit(tokenOf(household.id), input)).resolves.toBeUndefined();
  });

  it("has a free preview for the couple", async () => {
    f.deps.billing.enabled = true;
    const preview = await new GetGuestFormPreview(f.deps).execute(anna.id, websiteId, { household: "Familie Muster", people: ["Alex", "Sam"] });
    expect(preview.state).toBe("preview");
    expect(preview.household.people.length).toBeGreaterThan(0);
  });
});

describe("requests for additional guests", () => {
  it("adds or declines, and the household sees the outcome", async () => {
    const household = await weber();
    const people = Object.fromEntries(household.people.map((p) => [p.id, { attending: false }]));
    await submit(tokenOf(household.id), { people, requests: ["Lena", "Jonas"] });
    const [lena, jonas] = (await page()).overview.requests;
    await new DecideGuestRequest(f.deps).execute(anna.id, websiteId, lena!.id, "added");
    await new DecideGuestRequest(f.deps).execute(anna.id, websiteId, jonas!.id, "declined");
    await expect(new DecideGuestRequest(f.deps).execute(anna.id, websiteId, jonas!.id, "added")).rejects.toBeInstanceOf(NotFoundError);

    const view = await page();
    expect(view.overview.requests).toEqual([]);
    expect(view.households[0]!.people.map((p) => p.name)).toEqual(["Clara", "Max", "Lena"]);
    const form = await guestForm(tokenOf(household.id));
    expect(form!.state === "open" && form!.household.requests.map((r) => [r.name, r.status])).toEqual([
      ["Lena", "added"],
      ["Jonas", "declined"],
    ]);
  });
});

describe("CSV export", () => {
  const labels: CsvLabels = { household: "Haushalt", name: "Name", child: "Kind", status: "Status", meal: "Essen", allergies: "Allergien", message: "Nachricht", yes: "ja", no: "nein", statuses: { coming: "kommt", notComing: "kommt nicht", open: "offen" } };

  it("contains every person", async () => {
    await weber();
    const { filename, csv } = await new ExportGuestsCsv(f.deps).execute(anna.id, websiteId, labels);
    expect(filename).toBe("gaeste-2026-10-18.csv");
    expect(csv).toContain(`"Familie Weber";"Clara"`);
    expect(csv).toContain(`"Familie Weber";"Max"`);
  });
});

describe("guest data and account rights", () => {
  it("is part of the account export", async () => {
    await new SavePoll(f.deps).execute(anna.id, websiteId, null, { question: "Shuttle?", per: "household", options: [{ label: "Ja" }, { label: "Nein" }] });
    await weber();
    const entries = FakeArchive.read((await new ExportAccount(f.deps).execute(anna.id)).bytes);
    const data = JSON.parse(new TextDecoder().decode(entries[0]!.bytes));
    const { guests } = data.websites[0];
    expect(guests.settings).toMatchObject({ notify: "off" });
    expect(guests.polls[0]).toMatchObject({ question: "Shuttle?" });
    expect(guests.households[0]).toMatchObject({ name: "Familie Weber", people: [{ name: "Clara" }, { name: "Max" }] });
    expect(JSON.stringify(guests)).not.toContain("tokenHash");
  });

  it("is removed with the website and with the account", async () => {
    await weber();
    await new DeleteWebsite(f.deps).execute(anna.id, websiteId);
    expect(f.guests.households).toEqual([]);

    const other = (await new CreateWebsite(f.deps).execute(anna.id, { title: "Zwei" })).id;
    await new SaveHousehold(f.deps).execute(anna.id, other, null, { name: "Müller", people: [{ name: "Tom" }] });
    await new DeleteAccount(f.deps).execute(anna.id, "anna@example.org");
    expect(f.guests.households).toEqual([]);
  });
});

describe("RunGuestJobs", () => {
  const jobs = (websiteIdScope?: string) => new RunGuestJobs(f.deps).execute({ websiteId: websiteIdScope });

  it("deletes guest data 12 months after the wedding, after warning 30 days before (once)", async () => {
    await weber();
    expect(await jobs()).toEqual({ deleted: [], warned: [], summaries: [], emails: 0, reminders: 0 });

    f.clock.current = new Date("2028-05-15T10:00:00Z");
    expect((await jobs()).warned).toEqual([websiteId]);
    expect((await jobs()).warned).toEqual([]);
    expect(f.mailer.sent.map((m) => [m.to, m.subject])).toEqual([["anna@example.org", "Löschung: Anna & Ben"]]);
    expect((await page()).deletionSoon).toBe(true);

    f.clock.current = new Date("2028-06-13T00:00:01Z");
    expect((await jobs()).deleted).toEqual([websiteId]);
    expect(f.guests.households).toEqual([]);
  });

  it("keeps data after a refund until the regular end date, with the links stopped at once", async () => {
    await grantRsvp({ validUntil: new Date("2028-06-13T00:00:00Z") });
    const household = await weber();
    const [entitlement] = f.billingRepo.entitlements;
    entitlement!.revokedAt = f.clock.now();
    expect(await guestForm(tokenOf(household.id))).toMatchObject({ state: "inactive" });
    expect((await jobs()).deleted).toEqual([]);
    expect(f.guests.households).toHaveLength(1);
    f.clock.current = new Date("2028-06-13T00:00:01Z");
    expect((await jobs()).deleted).toEqual([websiteId]);
  });

  it("only touches the given website when scoped", async () => {
    await weber();
    f.clock.current = new Date("2029-01-01T00:00:00Z");
    expect((await jobs("someone-else")).deleted).toEqual([]);
    expect(f.guests.households).toHaveLength(1);
  });

  it("sends one daily summary from 8:00 with the answers since the last one", async () => {
    await new SaveRsvpSettings(f.deps).execute(anna.id, websiteId, { notify: "daily" });
    const household = await weber();
    f.clock.current = new Date("2026-10-19T05:00:00Z"); // 7:00 in Berlin
    await submit(tokenOf(household.id), { people: Object.fromEntries(household.people.map((p) => [p.id, { attending: false }])) });
    expect((await jobs()).summaries).toEqual([]);

    f.clock.current = new Date("2026-10-19T06:30:00Z");
    expect((await jobs()).summaries).toEqual([websiteId]);
    expect((await jobs()).summaries).toEqual([]);
    expect(JSON.parse(f.mailer.sent[0]!.text)).toMatchObject({ households: [{ name: "Familie Weber", coming: 0, notComing: 2 }] });

    f.clock.current = new Date("2026-10-20T06:30:00Z");
    expect((await jobs()).summaries).toEqual([]);
    expect(f.mailer.sent).toHaveLength(1);
  });
});
