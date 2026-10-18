import { describe, expect, it } from "vitest";
import { operatorDetails } from "@/domain/operator";

const full = {
  name: "Erika Musterfrau",
  businessName: "Musterfrau Hochzeitsdienste",
  address: "Musterstraße 1, 12345 Musterstadt, Deutschland",
  email: "kontakt@example.org",
  phone: "+49 123 456789",
  vatId: undefined,
  vatNote: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
  contentResponsible: "Erika Musterfrau, Anschrift wie oben",
  disputeResolution: "Wir nehmen nicht teil.",
};

describe("operatorDetails", () => {
  it("is configured when name, address and email are set", () => {
    const result = operatorDetails(full);
    expect(result.missing).toEqual([]);
    expect(result.details).toMatchObject({
      name: "Erika Musterfrau",
      addressLines: ["Musterstraße 1", "12345 Musterstadt", "Deutschland"],
      vatNote: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
    });
  });

  it("reports every missing required value and returns no details", () => {
    const result = operatorDetails({ name: "Erika", address: " ", email: undefined });
    expect(result.details).toBeNull();
    expect(result.missing).toEqual(["OPERATOR_ADDRESS", "OPERATOR_EMAIL"]);
  });

  it("defaults the person responsible for content to the operator", () => {
    const result = operatorDetails({ ...full, contentResponsible: undefined });
    expect(result.details?.contentResponsible).toBe("Erika Musterfrau");
  });
});
