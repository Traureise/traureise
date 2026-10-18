import { describe, expect, it } from "vitest";
import { daysUntil } from "@/lib/format";

describe("daysUntil", () => {
  it("counts calendar days in the website's timezone", () => {
    const lateEvening = new Date("2027-06-10T22:30:00Z"); // already 11 June in Berlin
    expect(daysUntil("2027-06-12", lateEvening, "Europe/Berlin")).toBe(1);
    expect(daysUntil("2027-06-12", lateEvening, "UTC")).toBe(2);
    expect(daysUntil("2027-06-01", lateEvening, "Europe/Berlin")).toBe(-10);
  });
});
