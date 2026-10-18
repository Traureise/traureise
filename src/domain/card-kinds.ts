/** The four kinds of wedding mail. One card of each kind per website. */
export const CARD_KINDS = ["saveTheDate", "invitation", "thankYou", "engagement"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** Kinds that go to the households of the guest list, through their personal link. */
export const HOUSEHOLD_CARD_KINDS = ["saveTheDate", "invitation", "thankYou"] as const satisfies readonly CardKind[];
export type HouseholdCardKind = (typeof HOUSEHOLD_CARD_KINDS)[number];

export function isCardKind(value: string): value is CardKind {
  return (CARD_KINDS as readonly string[]).includes(value);
}

export function isHouseholdCardKind(kind: CardKind): kind is HouseholdCardKind {
  return (HOUSEHOLD_CARD_KINDS as readonly string[]).includes(kind);
}
