import type { OperatorDetails } from "./operator";

/** What this instance actually does with personal data; the privacy policy is built from it. */
export type PrivacyFacts = {
  controller: OperatorDetails | null;
  hostingProvider: string | null;
  smtpProvider: string | null;
  storage: { driver: "local" } | { driver: "s3"; provider: string | null };
  paymentProvider: { name: string; details: string } | null;
  retention: { magicLinkMinutes: number; sessionDays: number; rateLimitMinutes: number };
};

/** A section of the policy: its message key under `privacy.sections` and the values it needs. */
export type PrivacySection = { id: string; params: Record<string, string | number> };

const named = (id: string, provider: string | null): PrivacySection =>
  provider ? { id, params: { provider } } : { id: `${id}Unnamed`, params: {} };

export function buildPrivacyPolicy(facts: PrivacyFacts): PrivacySection[] {
  const { storage, paymentProvider, retention } = facts;
  const sections: (PrivacySection | null)[] = [
    { id: "controller", params: {} },
    { id: "overview", params: {} },
    named("hosting", facts.hostingProvider),
    { id: "database", params: {} },
    named("email", facts.smtpProvider),
    storage.driver === "local" ? { id: "storageLocal", params: {} } : named("storageS3", storage.provider),
    paymentProvider ? { id: "payment", params: { provider: paymentProvider.name, details: paymentProvider.details } } : null,
    { id: "cookies", params: {} },
    { id: "login", params: { magicLinkMinutes: retention.magicLinkMinutes, sessionDays: retention.sessionDays } },
    { id: "rateLimit", params: { minutes: retention.rateLimitMinutes } },
    { id: "websites", params: {} },
    { id: "rights", params: {} },
    { id: "complaint", params: {} },
  ];
  return sections.filter((s): s is PrivacySection => s !== null);
}
