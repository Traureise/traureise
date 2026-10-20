import { describe, expect, it } from "vitest";
import { daysUntil, timeZoneLabel, timeZoneOptions } from "@/lib/format";

describe("daysUntil", () => {
  it("counts calendar days in the website's timezone", () => {
    const lateEvening = new Date("2027-06-10T22:30:00Z"); // already 11 June in Berlin
    expect(daysUntil("2027-06-12", lateEvening, "Europe/Berlin")).toBe(1);
    expect(daysUntil("2027-06-12", lateEvening, "UTC")).toBe(2);
    expect(daysUntil("2027-06-01", lateEvening, "Europe/Berlin")).toBe(-10);
  });
});

describe("time zones in German", () => {
  const winter = new Date("2027-01-15T12:00:00Z");

  it("names a zone in German with its city and UTC offset", () => {
    expect(timeZoneLabel("Europe/Berlin", winter)).toBe("Mitteleuropäische Zeit – Berlin (UTC+1)");
    expect(timeZoneLabel("America/Argentina/Buenos_Aires", winter)).toBe("Argentinische Normalzeit – Buenos Aires (UTC-3)");
    expect(timeZoneLabel("UTC", winter)).toBe("Koordinierte Weltzeit (UTC)");
  });

  it("lists zones by offset, keeping the ids as values", () => {
    const options = timeZoneOptions(["Europe/Berlin", "America/New_York", "Europe/London"], winter);
    expect(options.map((o) => o.id)).toEqual(["America/New_York", "Europe/London", "Europe/Berlin"]);
  });
});
