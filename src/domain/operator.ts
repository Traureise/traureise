/** Raw operator settings (OPERATOR_* env vars). */
export type OperatorInput = {
  name?: string;
  businessName?: string;
  address?: string;
  email?: string;
  phone?: string;
  vatId?: string;
  vatNote?: string;
  contentResponsible?: string;
  disputeResolution?: string;
};

/** Who runs this instance, as shown in the Impressum and the privacy policy. */
export type OperatorDetails = {
  name: string;
  businessName: string | null;
  addressLines: string[];
  email: string;
  phone: string | null;
  vatId: string | null;
  vatNote: string | null;
  contentResponsible: string;
  disputeResolution: string | null;
};

const REQUIRED = [
  ["name", "OPERATOR_NAME"],
  ["address", "OPERATOR_ADDRESS"],
  ["email", "OPERATOR_EMAIL"],
] as const;

const clean = (value: string | undefined) => value?.trim() || null;

/** Without name, address and email there is no valid Impressum, so no details at all. */
export function operatorDetails(input: OperatorInput): { details: OperatorDetails | null; missing: string[] } {
  const missing = REQUIRED.filter(([key]) => !clean(input[key])).map(([, env]) => env);
  if (missing.length > 0) return { details: null, missing };
  const name = clean(input.name)!;
  return {
    missing,
    details: {
      name,
      businessName: clean(input.businessName),
      addressLines: input.address!.split(",").map((line) => line.trim()).filter(Boolean),
      email: clean(input.email)!,
      phone: clean(input.phone),
      vatId: clean(input.vatId),
      vatNote: clean(input.vatNote),
      contentResponsible: clean(input.contentResponsible) ?? name,
      disputeResolution: clean(input.disputeResolution),
    },
  };
}
