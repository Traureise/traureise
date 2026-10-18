import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugify, validateSlug } from "@/domain/slug";

describe("slugify", () => {
  it("turns couple names into a readable German slug", () => {
    expect(slugify("Anna & Ben")).toBe("anna-und-ben");
    expect(slugify("Jürgen & Zoë Größe")).toBe("juergen-und-zoe-groesse");
    expect(slugify("  Hochzeit!!  2027 ")).toBe("hochzeit-2027");
  });

  it("limits length to 60 characters without trailing dash", () => {
    const slug = slugify("a".repeat(59) + " bcdef");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back to a non-empty slug", () => {
    expect(slugify("💍💍")).toBe("hochzeit");
  });
});

describe("validateSlug", () => {
  it("accepts lowercase letters, digits and inner dashes", () => {
    expect(validateSlug("anna-und-ben-2027")).toBeNull();
  });

  it.each([
    ["ab", "too_short"],
    ["a".repeat(61), "too_long"],
    ["Anna", "invalid"],
    ["anna_ben", "invalid"],
    ["-anna", "invalid"],
    ["anna--ben", "invalid"],
    ["dashboard", "reserved"],
    ["api", "reserved"],
    ["login", "reserved"],
  ])("rejects %s with %s", (slug, error) => {
    expect(validateSlug(slug)).toBe(error);
  });

  it("reserves every top-level app route", () => {
    for (const route of ["dashboard", "websites", "login", "logout", "auth", "uploads", "theme-assets", "willkommen"]) {
      expect(RESERVED_SLUGS).toContain(route);
    }
  });
});
