import { describe, expect, it } from "vitest";
import { germanDate, isoFromGermanDate, normalizeTime } from "@/domain/days";

describe("German dates", () => {
  it("reads TT.MM.JJJJ, also without leading zeros, and two-digit years as 20xx", () => {
    expect(isoFromGermanDate("12.06.2027")).toBe("2027-06-12");
    expect(isoFromGermanDate(" 1.6.2027 ")).toBe("2027-06-01");
    expect(isoFromGermanDate("1.6.27")).toBe("2027-06-01");
  });

  it("rejects days that do not exist and other formats", () => {
    expect(isoFromGermanDate("31.02.2027")).toBeNull();
    expect(isoFromGermanDate("2027-06-12")).toBeNull();
    expect(isoFromGermanDate("12/06/2027")).toBeNull();
    expect(isoFromGermanDate("")).toBeNull();
  });

  it("writes an ISO day as TT.MM.JJJJ", () => {
    expect(germanDate("2027-06-01")).toBe("01.06.2027");
    expect(germanDate("")).toBe("");
  });
});

describe("times", () => {
  it("reads 24-hour times with or without a colon", () => {
    expect(normalizeTime("14:30")).toBe("14:30");
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeTime("1430")).toBe("14:30");
    expect(normalizeTime("930")).toBe("09:30");
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("14.30")).toBe("14:30");
  });

  it("leaves what is not a time as it is, so the form can say so", () => {
    expect(normalizeTime("25:00")).toBe("25:00");
    expect(normalizeTime("2:30 PM")).toBe("2:30 PM");
    expect(normalizeTime("")).toBe("");
  });
});
