import { describe, expect, it } from "vitest";
import { normalizeEmail, isValidEmail } from "@/domain/email";
import { parseHome, isValidTimeZone, DEFAULT_TIMEZONE } from "@/domain/website";

describe("email", () => {
  it("normalises and validates addresses", () => {
    expect(normalizeEmail("  Anna@Example.ORG ")).toBe("anna@example.org");
    expect(isValidEmail("anna@example.org")).toBe(true);
    expect(isValidEmail("anna@")).toBe(false);
  });
});

describe("parseHome", () => {
  const home = { welcomeMessage: "Schön, dass ihr da seid.", hashtag: "#annaundben", showCountdown: true };

  it("is the website version's own part: welcome text, hashtag and countdown (names, date and place are the wedding's)", () => {
    const result = parseHome({ ...home, title: "ignored", weddingDate: "2027-06-12" });
    expect(result.ok && result.value).toEqual({ welcomeMessage: "Schön, dass ihr da seid.", hashtag: "annaundben", showCountdown: true });
  });

  it("rejects an invalid hashtag", () => {
    expect(parseHome({ ...home, hashtag: "#anna ben" }).ok).toBe(false);
  });

  it("defaults to Berlin time", () => {
    expect(DEFAULT_TIMEZONE).toBe("Europe/Berlin");
    expect(isValidTimeZone("Europe/Vienna")).toBe(true);
  });
});
