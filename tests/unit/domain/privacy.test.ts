import { describe, expect, it } from "vitest";
import { buildPrivacyPolicy, type PrivacyFacts } from "@/domain/privacy";

const facts: PrivacyFacts = {
  controller: null,
  hostingProvider: "Beispiel Hosting GmbH, Berlin",
  smtpProvider: "Beispiel Mail GmbH",
  storage: { driver: "local" },
  paymentProvider: null,
  retention: { magicLinkMinutes: 15, sessionDays: 30, rateLimitMinutes: 15 },
};

const ids = (f: PrivacyFacts) => buildPrivacyPolicy(f).map((s) => s.id);

describe("buildPrivacyPolicy", () => {
  it("covers what every instance does", () => {
    expect(ids(facts)).toEqual([
      "controller",
      "overview",
      "hosting",
      "database",
      "email",
      "storageLocal",
      "cookies",
      "login",
      "rateLimit",
      "websites",
      "rights",
      "complaint",
    ]);
  });

  it("names the configured processors", () => {
    const sections = buildPrivacyPolicy(facts);
    expect(sections.find((s) => s.id === "hosting")?.params).toEqual({ provider: "Beispiel Hosting GmbH, Berlin" });
    expect(sections.find((s) => s.id === "email")?.params).toEqual({ provider: "Beispiel Mail GmbH" });
  });

  it("uses neutral wording for processors that are not named", () => {
    const sections = buildPrivacyPolicy({ ...facts, hostingProvider: null, smtpProvider: null });
    expect(sections.find((s) => s.id === "hostingUnnamed")).toBeDefined();
    expect(sections.find((s) => s.id === "emailUnnamed")).toBeDefined();
  });

  it("describes S3 storage with its provider", () => {
    const sections = buildPrivacyPolicy({ ...facts, storage: { driver: "s3", provider: "Beispiel Cloud" } });
    expect(sections.find((s) => s.id === "storageS3")?.params).toEqual({ provider: "Beispiel Cloud" });
    expect(ids({ ...facts, storage: { driver: "s3", provider: null } })).toContain("storageS3Unnamed");
  });

  it("mentions the payment provider only when billing is on", () => {
    expect(ids(facts)).not.toContain("payment");
    const withPayment = buildPrivacyPolicy({ ...facts, paymentProvider: { name: "Creem", details: "Armitage Labs OÜ, Estland" } });
    expect(withPayment.find((s) => s.id === "payment")?.params).toEqual({ provider: "Creem", details: "Armitage Labs OÜ, Estland" });
  });

  it("states retention periods from the real settings", () => {
    const sections = buildPrivacyPolicy(facts);
    expect(sections.find((s) => s.id === "login")?.params).toEqual({ magicLinkMinutes: 15, sessionDays: 30 });
    expect(sections.find((s) => s.id === "rateLimit")?.params).toEqual({ minutes: 15 });
  });
});
