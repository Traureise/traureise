import { describe, expect, it } from "vitest";
import { buildAllDayIcs, buildIcs, mapLink } from "@/domain/calendar";

const base = {
  uid: "item-1@traureise",
  title: "Freie Trauung",
  description: "Bitte pünktlich sein; danach Sekt, Kuchen",
  location: "Gut Sonnenhof, Hofweg 3",
  start: { date: "2027-06-12", time: "14:30" },
  end: null,
  timeZone: "Europe/Berlin",
  url: "http://localhost:3000/anna-und-ben",
};
const now = new Date("2026-10-18T10:00:00Z");

describe("buildIcs", () => {
  it("converts wall-clock times in the website timezone to UTC", () => {
    const ics = buildIcs({ ...base, end: { date: "2027-06-12", time: "16:00" } }, now);
    expect(ics).toContain("DTSTART:20270612T123000Z"); // CEST = UTC+2
    expect(ics).toContain("DTEND:20270612T140000Z");
    expect(ics).toContain("DTSTAMP:20261018T100000Z");
  });

  it("handles winter time and defaults to one hour without an end", () => {
    const ics = buildIcs({ ...base, start: { date: "2027-01-09", time: "18:00" } }, now);
    expect(ics).toContain("DTSTART:20270109T170000Z"); // CET = UTC+1
    expect(ics).toContain("DTEND:20270109T180000Z");
  });

  it("produces a well-formed calendar with escaped text and CRLF line endings", () => {
    const ics = buildIcs(base, now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("UID:item-1@traureise");
    expect(ics).toContain("SUMMARY:Freie Trauung");
    expect(ics).toContain("DESCRIPTION:Bitte pünktlich sein\; danach Sekt\\, Kuchen");
    expect(ics).toContain("LOCATION:Gut Sonnenhof\\, Hofweg 3");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it("folds long lines", () => {
    const ics = buildIcs({ ...base, description: "x".repeat(200) }, now);
    expect(ics).toMatch(/DESCRIPTION:x+\r\n x+/);
  });
});

describe("mapLink", () => {
  it("points at the exact spot when the place was picked on the map", () => {
    expect(mapLink("Gut Sonnenhof, Hofweg 3", { latitude: 47.72, longitude: 10.31 })).toBe(
      "https://www.openstreetmap.org/?mlat=47.72&mlon=10.31#map=17/47.72/10.31",
    );
    // Saved before coordinates existed: the fields are missing.
    expect(mapLink("Hofweg 3", {} as { latitude: null; longitude: null })).toBe("https://www.openstreetmap.org/search?query=Hofweg%203");
  });

  it("links to OpenStreetMap search", () => {
    expect(mapLink("Hofweg 3, Beispielstadt")).toBe(
      "https://www.openstreetmap.org/search?query=Hofweg%203%2C%20Beispielstadt",
    );
  });
});

describe("buildAllDayIcs", () => {
  it("makes an all-day event for a date without a time (Save the Date)", () => {
    const ics = buildAllDayIcs({ uid: "w1-wedding@traureise", title: "Hochzeit Anna & Ben", location: "Hamburg", date: "2027-12-31", url: "http://localhost:3000/anna" }, new Date("2026-10-18T10:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20271231\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20280101\r\n");
    expect(ics).toContain("SUMMARY:Hochzeit Anna & Ben\r\n");
    expect(ics).toContain("LOCATION:Hamburg\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
