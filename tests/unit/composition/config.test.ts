import { describe, expect, it } from "vitest";
import { billingProblems, loadConfig, startupWarnings } from "@/composition/config";

const base = { DATABASE_URL: "postgres://x" } as unknown as NodeJS.ProcessEnv;

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
  it("warns about missing operator details and incomplete billing", () => {
    const warnings = startupWarnings(loadConfig({ ...base, OPERATOR_NAME: "Erika", BILLING_ENABLED: "true" }));
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("OPERATOR_ADDRESS, OPERATOR_EMAIL");
    expect(warnings[1]).toContain("CREEM_API_KEY, CREEM_WEBHOOK_SECRET");
  });

  it("is quiet for a fully configured instance", () => {
    const config = loadConfig({
      ...base,
      OPERATOR_NAME: "Erika",
      OPERATOR_ADDRESS: "Musterstraße 1, 12345 Musterstadt",
      OPERATOR_EMAIL: "kontakt@example.org",
      BILLING_ENABLED: "true",
      CREEM_API_KEY: "k",
      CREEM_WEBHOOK_SECRET: "s",
    });
    expect(startupWarnings(config)).toEqual([]);
    expect(billingProblems(config)).toEqual([]);
  });
});
