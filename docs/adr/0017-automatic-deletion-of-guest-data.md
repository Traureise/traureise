---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Guest data is deleted automatically when the package ends

## Context and Problem Statement

Guests never agreed to Traureise keeping their answers (including allergies, which can be health data,
Art. 9 DSGVO) forever. The couple needs the data until some time after the wedding. When is it deleted,
and what happens after a refund or on instances without billing?

## Considered Options

* Keep it until the couple deletes it
* Delete at the end of the RSVP package; on refund delete at once
* Delete at the end of the RSVP package; on refund stop the links but keep the data until that date

## Decision Outcome

Chosen option: the third.

* `guestDataDeletionDate` is the latest of: the end of the day 12 months after the wedding date, and
  `valid_until` of every RSVP-or-higher entitlement, refunded ones included. No wedding date and no
  package: never. The same rule applies without billing (no entitlements) and with billing when RSVP was
  never bought.
* At that date the households of the website are deleted, which removes people, answers, requests and
  poll answers through the cascades. Settings and poll definitions stay (they contain no guest data).
* 30 days before, the couple gets one email and the Gäste page shows a notice suggesting the CSV export.
* A refund or chargeback revokes the entitlement, so links stop at once (ADR 0016), but the data stays
  until the regular date, so the couple can still export it or buy again and continue.

### Consequences

* Good, because nothing about guests outlives its purpose, and the privacy policy can name a date.
* Good, because a refund never destroys data the couple may still need.
* Bad, because a couple that moves the wedding date after buying keeps the original package end; the
  rule takes the later of both dates, so data is never deleted before 12 months after the wedding.
