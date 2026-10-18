import { describe, expect, it } from "vitest";
import { appSecret, billingProblems, FALLBACK_SECRET, loadConfig, startupWarnings } from "@/composition/config";

const base = { DATABASE_URL: "postgres://x" } as unknown as NodeJS.ProcessEnv;
const SECRET = "s".repeat(40);

describe("loadConfig", () => {
  it("keeps billing off and uses the default prices", () => {
    const config = loadConfig(base);
    expect(config.BILLING_ENABLED).toBe(false);
    expect([config.PRICE_RSVP_EUR, config.PRICE_INVITATIONS_EUR, config.PRICE_COMPLETE_EUR]).toEqual([49, 139, 149]);
    expect(config.BILLING_TEST_UNLOCK_TIERS).toEqual([]);
  });

  it("parses the test unlock list and rejects unknown tiers", () => {
    expect(loadConfig({ ...base, BILLING_TEST_UNLOCK_TIERS: "rsvp, complete" }).BILLING_TEST_UNLOCK_TIERS).toEqual(["rsvp", "complete"]);
    expect(() => loadConfig({ ...base, BILLING_TEST_UNLOCK_TIERS: "gold" })).toThrow();
  });
});

describe("startupWarnings", () => {
  it("warns about missing legal pages and incomplete billing", () => {
    const warnings = startupWarnings(loadConfig({ ...base, APP_SECRET: SECRET, IMPRINT_FILE: "/legal/impressum.md", BILLING_ENABLED: "true" }));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("IMPRINT_FILE and PRIVACY_FILE");
    expect(warnings[1]).toContain("CREEM_API_KEY, CREEM_WEBHOOK_SECRET");
  });

  it("warns about a missing, placeholder or short APP_SECRET and about test hooks", () => {
    for (const APP_SECRET of [undefined, "change-me", "short"]) {
      expect(startupWarnings(loadConfig({ ...base, APP_SECRET, IMPRINT_FILE: "/i.md", PRIVACY_FILE: "/p.md" }))[0]).toContain("APP_SECRET");
    }
    expect(appSecret(loadConfig(base))).toBe(FALLBACK_SECRET);
    expect(startupWarnings(loadConfig({ ...base, APP_SECRET: SECRET, IMPRINT_FILE: "/i.md", PRIVACY_FILE: "/p.md", TEST_HOOKS: "true" }))).toEqual([
      expect.stringContaining("TEST_HOOKS"),
    ]);
  });

  it("is quiet for a fully configured instance", () => {
    const config = loadConfig({
      ...base,
      APP_SECRET: SECRET,
      IMPRINT_FILE: "/legal/impressum.md",
      PRIVACY_FILE: "/legal/datenschutz.md",
      BILLING_ENABLED: "true",
      CREEM_API_KEY: "k",
      CREEM_WEBHOOK_SECRET: "s",
    });
    expect(startupWarnings(config)).toEqual([]);
    expect(billingProblems(config)).toEqual([]);
  });
});
