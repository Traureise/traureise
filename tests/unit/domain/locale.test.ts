import { describe, expect, it } from "vitest";
import { resolveLocale } from "@/i18n/resolve";

const locales = ["de", "en"] as const;

describe("resolveLocale", () => {
  it("prefers an explicit choice when a catalogue exists for it", () => {
    expect(resolveLocale("en", "de-DE", locales, "de")).toBe("en");
    expect(resolveLocale("fr", "en-GB", locales, "de")).toBe("en");
  });

  it("follows Accept-Language by quality and matches regional tags", () => {
    expect(resolveLocale(undefined, "fr-FR, en-US;q=0.8, de;q=0.9", locales, "de")).toBe("de");
    expect(resolveLocale(undefined, "fr-FR, en-US;q=0.8", locales, "de")).toBe("en");
  });

  it("falls back to the default", () => {
    expect(resolveLocale(undefined, "fr, it;q=0.5, *", locales, "de")).toBe("de");
    expect(resolveLocale(undefined, null, locales, "de")).toBe("de");
    expect(resolveLocale(undefined, "en", ["de"], "de")).toBe("de");
  });
});
