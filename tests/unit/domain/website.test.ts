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
  const home = {
    title: "Anna & Ben",
    weddingDate: "2027-06-12",
    location: "Beispielstadt",
    welcomeMessage: "Schön, dass ihr da seid.",
    hashtag: "#annaundben",
    showCountdown: true,
    timezone: "Europe/Berlin",
  };

  it("accepts a complete home section and strips the hashtag sign", () => {
    const result = parseHome(home);
    expect(result.ok && result.value).toMatchObject({ title: "Anna & Ben", hashtag: "annaundben" });
  });

  it("treats empty date and location as not decided yet", () => {
    const result = parseHome({ ...home, weddingDate: "", location: "  " });
    expect(result.ok && result.value).toMatchObject({ weddingDate: null, location: null });
  });

  it("rejects an empty title, an impossible date and an unknown timezone", () => {
    expect(parseHome({ ...home, title: " " }).ok).toBe(false);
    expect(parseHome({ ...home, weddingDate: "2027-02-30" }).ok).toBe(false);
    expect(parseHome({ ...home, timezone: "Mars/Olympus" }).ok).toBe(false);
  });

  it("defaults to Berlin time", () => {
    expect(DEFAULT_TIMEZONE).toBe("Europe/Berlin");
    expect(isValidTimeZone("Europe/Vienna")).toBe(true);
  });
});
