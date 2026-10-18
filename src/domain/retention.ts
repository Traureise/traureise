import { canUse, endOfDayTwelveMonthsAfter, TIERS, type Entitlement, type FeatureContext } from "./billing";

/** Days before the deletion when the couple is warned and the Gäste page suggests the CSV export. */
export const RETENTION_WARNING_DAYS = 30;

/**
 * When a website's guest data is deleted: the latest of 12 months after the wedding and the end of every
 * RSVP-or-higher package, refunded ones included (a refund stops the links, not the data). Without a
 * wedding date and without a package: never.
 */
export function guestDataDeletionDate(input: { weddingDate: string | null; entitlements: readonly Entitlement[] }): Date | null {
  const candidates = input.entitlements.filter((e) => TIERS.indexOf(e.tier) >= TIERS.indexOf("rsvp")).map((e) => e.validUntil);
  if (input.weddingDate) candidates.push(endOfDayTwelveMonthsAfter(input.weddingDate));
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((d) => d.getTime())));
}

/** Personal links accept answers only with the RSVP tier and until the guest data is deleted. */
export function guestLinksActive(context: FeatureContext, weddingDate: string | null, now: Date): boolean {
  const deleteAt = guestDataDeletionDate({ weddingDate, entitlements: context.entitlements });
  return canUse("rsvp", context, now) && (!deleteAt || now < deleteAt);
}

export function retentionWarningDue(deleteAt: Date | null, now: Date): boolean {
  return deleteAt !== null && now.getTime() >= deleteAt.getTime() - RETENTION_WARNING_DAYS * 86_400_000;
}
