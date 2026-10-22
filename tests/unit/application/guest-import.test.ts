import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/application/errors";
import { DownloadGuestTemplate, ImportGuests, PlanGuestImport, PreviewGuestImport } from "@/application/guest-import";
import { DeleteHousehold, SaveHousehold } from "@/application/guests";
import { AddEvent } from "@/application/schedule";
import { CreateWedding } from "@/application/weddings";
import { IMPORT_MAX_BYTES, type ImportHeaders, type ImportRow } from "@/domain/guest-import";
import { createFakes, FakeSpreadsheets } from "../../fakes";

const headers: ImportHeaders = { name: "Name", household: "Haushalt", child: "Kind", email: "E-Mail", allergies: "Allergien", personalLine: "Persönliche Zeile" };

let f: ReturnType<typeof createFakes>;
let anna: { id: string };
let weddingId: string;
let sheet: FakeSpreadsheets;

const row = (line: number, name: string, extra: Partial<ImportRow> = {}): ImportRow => ({ line, name, household: "", child: "", email: "", allergies: "", personalLine: "", events: {}, ...extra });
const file = (size = 10) => ({ bytes: new Uint8Array(size) });

beforeEach(async () => {
  f = createFakes();
  f.deps.billing.enabled = false;
  sheet = f.deps.spreadsheets as FakeSpreadsheets;
  anna = await f.users.create("anna@example.org");
  weddingId = (await new CreateWedding(f.deps).execute(anna.id, { title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12" })).id;
  await new AddEvent(f.deps).execute(anna.id, weddingId, { eventType: "reception", name: "Feier", startDate: "2027-06-12", startTime: "18:00" });
});

describe("DownloadGuestTemplate", () => {
  it("writes the headers and the events as columns", async () => {
    const result = await new DownloadGuestTemplate(f.deps).execute(anna.id, weddingId, headers);
    expect(result.filename).toBe("gaeste-vorlage.xlsx");
    expect(sheet.written[0]![0]).toEqual(["Name", "Haushalt", "Kind", "E-Mail", "Allergien", "Persönliche Zeile", "Feier"]);
  });
});

describe("someone else's wedding", () => {
  it("is not found for the template and for planning", async () => {
    const bob = await f.users.create("bob@example.org");
    await expect(new DownloadGuestTemplate(f.deps).execute(bob.id, weddingId, headers)).rejects.toBeInstanceOf(NotFoundError);
    await expect(new PlanGuestImport(f.deps).execute(bob.id, weddingId, { rows: [], decisions: {}, ignoredColumns: [] })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("PreviewGuestImport", () => {
  const preview = (size?: { bytes: Uint8Array }, userId = anna.id) => new PreviewGuestImport(f.deps).execute(userId, weddingId, size ?? file(), headers);
  const fileError = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as ValidationError;

  it("refuses an empty or too large file without reading it", async () => {
    let calls = 0;
    sheet.read = () => (calls++, sheet.result);
    expect((await fileError(preview(file(0)))).fieldErrors).toEqual({ file: "empty" });
    expect((await fileError(preview(file(IMPORT_MAX_BYTES + 1)))).fieldErrors).toEqual({ file: "too_large" });
    expect(calls).toBe(0);
  });

  it("passes on what the codec and the table reader report", async () => {
    sheet.result = { ok: false, error: "unreadable" };
    expect((await fileError(preview())).fieldErrors).toEqual({ file: "unreadable" });
    sheet.result = { ok: false, error: "too_large" };
    expect((await fileError(preview())).fieldErrors).toEqual({ file: "too_large" });
    sheet.result = { ok: true, rows: [["Haushalt"], ["Weber"]] };
    expect((await fileError(preview())).fieldErrors).toEqual({ file: "no_name_column" });
    sheet.result = { ok: true, rows: [["Name"]] };
    expect((await fileError(preview())).fieldErrors).toEqual({ file: "empty" });
  });

  it("returns the rows and a plan", async () => {
    sheet.result = { ok: true, rows: [["Name", "Haushalt", "Farbe"], ["Clara", "Weber", "x"]] };
    const review = await preview();
    expect(review.rows).toHaveLength(1);
    expect(review.ignoredColumns).toEqual(["Farbe"]);
    expect(review.plan.create).toHaveLength(1);
  });

  it("returns rows that planning accepts, however long the cells and however many columns", async () => {
    const long = "x".repeat(5000);
    sheet.result = { ok: true, rows: [["Name", ...Array.from({ length: 300 }, (_, i) => `Spalte ${i}`)], ["Clara", long], ["Dora"]] };
    const review = await preview();
    expect(review.plan.problems).toEqual([]);
    sheet.result = { ok: true, rows: [["Name", "Allergien"], ["Clara", long], ["Dora"]] };
    const longRow = await preview();
    expect(longRow.plan.problems).toEqual([{ line: 2, field: "allergies", code: "too_long" }]);
    const planned = await new PlanGuestImport(f.deps).execute(anna.id, weddingId, { rows: longRow.rows, decisions: { 2: { action: "skip" } }, ignoredColumns: review.ignoredColumns });
    expect(planned.ready).toBe(true);
    await new ImportGuests(f.deps).execute(anna.id, weddingId, { rows: longRow.rows, decisions: { 2: { action: "skip" } } });
    expect((await f.deps.guests.listHouseholds(weddingId)).map((h) => h.name)).toEqual(["Dora"]);
  });

  it("does not show someone else's wedding", async () => {
    const bob = await f.users.create("bob@example.org");
    await expect(preview(undefined, bob.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ImportGuests", () => {
  const run = (rows: unknown, decisions: unknown = {}) => new ImportGuests(f.deps).execute(anna.id, weddingId, { rows, decisions });
  const reason = async (p: Promise<unknown>) => ((await p.then(() => null, (e) => e)) as ValidationError).fieldErrors;

  it("creates households with the hashes of their links", async () => {
    const result = await run([row(2, "Clara", { household: "Weber", allergies: "Nüsse" }), row(3, "Max", { household: "Weber" }), row(4, "Oma")]);
    expect(result).toEqual({ households: 2, people: 3, overwritten: 0 });
    const stored = f.guests.households;
    expect(stored.map((h) => h.name)).toEqual(["Weber", "Oma"]);
    for (const h of stored) expect(h.tokenHash).toBe(f.guestLinks.hash(f.guestLinks.tokenFor(h.id)));
    expect(stored[0]!.people.map((p) => [p.name, p.allergies])).toEqual([["Clara", "Nüsse"], ["Max", ""]]);
  });

  it("joins an existing household, and re-plans against the current list when it is gone", async () => {
    const h = await new SaveHousehold(f.deps).execute(anna.id, weddingId, null, { name: "Weber", people: [{ name: "Clara" }] });
    const rows = [row(2, "Max", { household: "weber" })];
    expect(await run(rows)).toEqual({ households: 0, people: 1, overwritten: 0 });
    expect(f.guests.households.find((x) => x.id === h.id)!.people.map((p) => p.name)).toEqual(["Clara", "Max"]);
    await new DeleteHousehold(f.deps).execute(anna.id, weddingId, h.id);
    // Without the household, "Weber" is a new one; a plan made against the old list must not be applied blindly.
    expect(await run(rows)).toEqual({ households: 1, people: 1, overwritten: 0 });
  });

  it("refuses an undecided duplicate and writes nothing", async () => {
    await new SaveHousehold(f.deps).execute(anna.id, weddingId, null, { name: "Weber", people: [{ name: "Clara" }] });
    expect(await reason(run([row(2, "clara"), row(3, "Neu")]))).toEqual({ _: "review_outdated" });
    expect(f.guests.households).toHaveLength(1);
  });

  it("refuses when the overwrite target is gone", async () => {
    const h = await new SaveHousehold(f.deps).execute(anna.id, weddingId, null, { name: "Weber", people: [{ name: "Clara" }] });
    const decisions = { 2: { action: "overwrite", guestId: h.people[0]!.id } };
    await new SaveHousehold(f.deps).execute(anna.id, weddingId, h.id, { name: "Weber", people: [{ name: "Max" }] });
    expect(await reason(run([row(2, "Clara")], decisions))).toEqual({ _: "review_outdated" });
  });

  it("refuses when a person matching by name appeared after the plan", async () => {
    const rows = [row(2, "Clara")];
    expect((await new PlanGuestImport(f.deps).execute(anna.id, weddingId, { rows, decisions: {}, ignoredColumns: [] })).ready).toBe(true);
    await new SaveHousehold(f.deps).execute(anna.id, weddingId, null, { name: "Weber", people: [{ name: "Clara" }] });
    expect(await reason(run(rows))).toEqual({ _: "review_outdated" });
    expect(f.guests.households).toHaveLength(1);
  });

  it("overwrites a decided duplicate and keeps answers", async () => {
    const h = await new SaveHousehold(f.deps).execute(anna.id, weddingId, null, { name: "Weber", people: [{ name: "Clara" }] });
    const result = await run([row(2, "Clara", { email: "c@example.org" })], { 2: { action: "overwrite", guestId: h.people[0]!.id } });
    expect(result).toEqual({ households: 0, people: 0, overwritten: 1 });
    expect(f.guests.households[0]!.people[0]).toMatchObject({ name: "Clara", email: "c@example.org" });
  });

  it("rejects malformed input", async () => {
    expect(await reason(run("nope"))).toEqual({ rows: "invalid" });
    expect(await reason(run([row(0, "A")]))).toEqual({ rows: "invalid" });
    expect(await reason(run([row(2, "x".repeat(2001))]))).toEqual({ rows: "invalid" });
    expect(await reason(run(Array.from({ length: 1001 }, (_, i) => row(i + 2, `P${i}`))))).toEqual({ rows: "invalid" });
    expect(await reason(run([row(2, "A")], { abc: { action: "skip" } }))).toEqual({ decisions: "invalid" });
    await expect(new ImportGuests(f.deps).execute((await f.users.create("b@example.org")).id, weddingId, { rows: [], decisions: {} })).rejects.toBeInstanceOf(NotFoundError);
  });
});
