/** The four kinds of wedding mail, in the order a couple needs them. Each has one or more versions. */
export const CARD_KINDS = ["saveTheDate", "invitation", "thankYou", "engagement"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/**
 * Kinds that go to the households of the guest list, through their personal link: all of them. The engagement
 * announcement also has a public link for everyone else.
 */
export const HOUSEHOLD_CARD_KINDS = ["engagement", "saveTheDate", "invitation", "thankYou"] as const satisfies readonly CardKind[];
export type HouseholdCardKind = (typeof HOUSEHOLD_CARD_KINDS)[number];

export function isCardKind(value: string): value is CardKind {
  return (CARD_KINDS as readonly string[]).includes(value);
}

export function isHouseholdCardKind(kind: CardKind): kind is HouseholdCardKind {
  return (HOUSEHOLD_CARD_KINDS as readonly string[]).includes(kind);
}
