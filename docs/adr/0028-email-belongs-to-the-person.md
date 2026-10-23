---
status: accepted
date: 2026-10-22
decision-makers: Traureise maintainers
---

# Email addresses belong to the person, the household stays the unit of delivery

## Context and Problem Statement

A household had one optional email address. Real guest lists (and the spreadsheets couples already keep) list an
address per person: a couple lives together, but each partner has their own mailbox, and a family may have a parent
who wants the card and another who should get it too. Where does the address belong, and what does that change
about sending and unsubscribing?

## Considered Options

* Keep one address on the household and let the couple type several into it
* An address per person; a household is mailed at every address of its people
* An address per person, and one mail per address (each person is its own recipient)

## Decision Outcome

Chosen option: "An address per person; a household is mailed at every address of its people", because the data then
matches how guests are listed, while delivery tracking stays as it is.

* `guests.email` (nullable) replaces `households.email`. Domain `Guest.email` and `householdEmails(household)`
  (the distinct non-empty addresses, in person order) are the only readers; "has an email" for a household means
  at least one person has an address.
* A card or reminder is still sent **once per household**, with every address in `To` (they share a home).
  Deliveries, claiming, opened status and version choice are unchanged. A repeated address is mailed once.
* The unsubscribe link still stops mail for the whole household: it clears every person's address and sets
  `households.unsubscribedAt`, in one transaction. Saving the household with an address that none of its people
  had before ends an earlier unsubscribe; keeping or removing addresses does not.
* A Drizzle migration drops `households.email` and adds `guests.email`. No instance holds real data, so existing
  addresses are not copied over.

"One mail per address" was dropped: it would need a delivery per person, per-address opened status and a different
unsubscribe, for no gain a household sharing a home asks for.

### Consequences

* Good, because the guest form, the import from a spreadsheet and the export all speak in people and addresses.
* Good, because sending, tracking and unsubscribing keep one unit, the household.
* Bad, because one person's mailbox cannot be unsubscribed alone: the link ends mail for everyone in the household.

### Confirmation

Unit tests for `householdEmails`, the per-person form parsing and the single queued delivery with several
addresses; integration tests for the unsubscribe and for when a new address ends it; the card E2E tests enter the
address on the person.
