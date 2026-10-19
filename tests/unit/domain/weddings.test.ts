import { describe, expect, it } from "vitest";
import {
  assignedVersion,
  daysUntil,
  firstVersion,
  householdCardDone,
  needsDate,
  parseNewWedding,
  parseVersionLabel,
  parseWeddingDetails,
  timelineStates,
  VERSION_FEATURES,
  VERSION_ITEMS,
  websiteOnline,
} from "@/domain/weddings";
import { canUse } from "@/domain/billing";

describe("parseNewWedding", () => {
  it("asks only for the names and, if planned, the date", () => {
    expect(parseNewWedding({ title: " Anna & Ben ", hasDate: true, weddingDate: "2027-06-12" })).toEqual({ ok: true, value: { title: "Anna & Ben", weddingDate: "2027-06-12" } });
    expect(parseNewWedding({ title: "Anna & Ben", hasDate: false, weddingDate: "2027-06-12" })).toEqual({ ok: true, value: { title: "Anna & Ben", weddingDate: null } });
  });

  it("needs the names, and a date once the couple says they have one", () => {
    expect(parseNewWedding({ title: "", hasDate: false })).toMatchObject({ ok: false, fieldErrors: { title: "required" } });
    expect(parseNewWedding({ title: "Anna & Ben", hasDate: true, weddingDate: "" })).toMatchObject({ ok: false, fieldErrors: { weddingDate: "required" } });
    expect(parseNewWedding({ title: "Anna & Ben", hasDate: true, weddingDate: "2027-02-30" })).toMatchObject({ ok: false, fieldErrors: { weddingDate: "invalid_date" } });
  });
});

describe("parseWeddingDetails", () => {
  it("takes names, date, place and time zone; no date means not planned yet", () => {
    expect(parseWeddingDetails({ title: "Anna & Ben", hasDate: true, weddingDate: "2027-06-12", location: " Kempten ", timezone: "Europe/Vienna" })).toEqual({
      ok: true,
      value: { title: "Anna & Ben", weddingDate: "2027-06-12", location: "Kempten", timezone: "Europe/Vienna" },
    });
    expect(parseWeddingDetails({ title: "Anna & Ben", hasDate: false, weddingDate: "2027-06-12", location: "" })).toEqual({
      ok: true,
      value: { title: "Anna & Ben", weddingDate: null, location: null, timezone: "Europe/Berlin" },
    });
    expect(parseWeddingDetails({ title: "Anna & Ben", hasDate: false, timezone: "Mars/Olympus" })).toMatchObject({ ok: false, fieldErrors: { timezone: "invalid_timezone" } });
  });
});

describe("parseVersionLabel", () => {
  it("is required and short", () => {
    expect(parseVersionLabel(" Familie ")).toEqual({ ok: true, value: "Familie" });
    expect(parseVersionLabel("")).toMatchObject({ ok: false, fieldErrors: { label: "required" } });
    expect(parseVersionLabel("x".repeat(41))).toMatchObject({ ok: false, fieldErrors: { label: "too_long" } });
  });
});

const v = (id: string, position: number, published = false) => ({ id, position, published });

describe("versions", () => {
  it("the first version is the one with the lowest position", () => {
    expect(firstVersion([v("b", 2), v("a", 0), v("c", 1)])?.id).toBe("a");
    expect(firstVersion([])).toBeNull();
  });

  it("a household gets its assigned version, else the first", () => {
    const versions = [v("std", 0), v("family", 1)];
    const assignments = [{ householdId: "h1", item: "saveTheDate" as const, versionId: "family" }];
    expect(assignedVersion(versions, assignments, "h1", "saveTheDate")?.id).toBe("family");
    expect(assignedVersion(versions, assignments, "h2", "saveTheDate")?.id).toBe("std");
    expect(assignedVersion(versions, assignments, "h1", "invitation")?.id).toBe("std");
    // An assignment to a version that is gone falls back to the first.
    expect(assignedVersion([v("std", 0)], assignments, "h1", "saveTheDate")?.id).toBe("std");
  });

  it("a website version is online once published; extra versions also need a paid package", () => {
    const versions = [v("first", 0, true), v("extra", 1, true), v("draft", 2, false)];
    expect(websiteOnline(versions[0]!, versions, false)).toBe(true);
    expect(websiteOnline(versions[1]!, versions, false)).toBe(false);
    expect(websiteOnline(versions[1]!, versions, true)).toBe(true);
    expect(websiteOnline(versions[2]!, versions, true)).toBe(false);
  });

  it("extra versions are paid per item", () => {
    const billing = (tier: "rsvp" | "invitations" | "complete" | null) => ({
      billingEnabled: true,
      entitlements: tier ? [{ tier, purchaseRef: "o", validUntil: new Date("2030-01-01"), revokedAt: null }] : [],
    });
    const now = new Date("2026-10-19T10:00:00Z");
    const allowed = (tier: Parameters<typeof billing>[0]) => VERSION_ITEMS.filter((item) => canUse(VERSION_FEATURES[item], billing(tier), now));
    expect(allowed(null)).toEqual([]);
    expect(allowed("rsvp")).toEqual(["website"]);
    expect(allowed("invitations")).toEqual(["saveTheDate", "website", "invitation"]);
    expect(allowed("complete")).toEqual(["engagement", "saveTheDate", "website", "invitation", "thankYou"]);
    expect(VERSION_ITEMS.every((item) => canUse(VERSION_FEATURES[item], { billingEnabled: false, entitlements: [] }, now))).toBe(true);
  });
});

describe("timeline", () => {
  it("runs in the order a couple needs things", () => {
    expect(VERSION_ITEMS).toEqual(["engagement", "saveTheDate", "website", "invitation", "thankYou"]);
  });

  it("marks finished steps, lifts out the next open one and keeps the rest quiet", () => {
    expect(timelineStates({ engagement: true, saveTheDate: true, website: false, invitation: false, thankYou: false })).toEqual({
      engagement: "done",
      saveTheDate: "done",
      website: "now",
      invitation: "later",
      thankYou: "later",
    });
    expect(timelineStates({ engagement: false, saveTheDate: false, website: true, invitation: false, thankYou: false })).toMatchObject({ engagement: "now", website: "done", invitation: "later" });
    expect(Object.values(timelineStates({ engagement: true, saveTheDate: true, website: true, invitation: true, thankYou: true }))).not.toContain("now");
  });

  it("a household card is done once every household it is meant for got it", () => {
    expect(householdCardDone({ households: 3, sent: 3 })).toBe(true);
    expect(householdCardDone({ households: 3, sent: 2 })).toBe(false);
    expect(householdCardDone({ households: 0, sent: 0 })).toBe(false);
  });

  it("counts the days to the wedding in its time zone", () => {
    expect(daysUntil("2026-10-31", "Europe/Berlin", new Date("2026-10-19T10:00:00Z"))).toBe(12);
    expect(daysUntil("2026-10-19", "Europe/Berlin", new Date("2026-10-18T22:30:00Z"))).toBe(0);
    expect(daysUntil("2026-10-01", "Europe/Berlin", new Date("2026-10-19T10:00:00Z"))).toBe(-18);
  });

  it("Save the Date and invitation wait for a date; the engagement and thank-you card do not", () => {
    expect(["engagement", "saveTheDate", "invitation", "thankYou"].filter((k) => needsDate(k as never))).toEqual(["saveTheDate", "invitation"]);
  });
});
