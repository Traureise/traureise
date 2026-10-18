---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Configuring guests is free, sending is the RSVP tier

## Context and Problem Statement

RSVP is the first paid tier (v2's pricing). Couples should be able to try the guest list before they
pay, and self-hosted instances without billing must not see any locks. Where exactly is the line?

## Considered Options

* Everything about guests behind the RSVP tier
* Configure for free, pay to send (active personal links, sharing, notifications)
* Free up to a number of households

## Decision Outcome

Chosen option: "Configure for free, pay to send".

* `FEATURE_TIERS`: `guestList`, `polls` and `mealChoices` move to the free `website` tier; `rsvp`
  (sending) stays on `rsvp`. `RELEASED_TIERS` now includes `rsvp`, so it is sold without
  `BILLING_TEST_UNLOCK_TIERS`.
* All gating goes through `canUse(feature, context, now)`; `guestLinksActive` combines it with the
  retention date (ADR 0017). Use cases decide, pages only render the result.
* Without the tier the Gäste page shows a notice, "Link kopieren" and "WhatsApp" lead to `/preise`, the
  page never contains a link, and a link opened by a guest shows a neutral "not active yet" page that
  reveals nothing about the household. The preview of the form is free.
* Without billing (self-hosted) `canUse` allows everything and nothing mentions prices.

### Consequences

* Good, because couples can build the whole list and see the form before paying.
* Good, because one rule covers the website card, the Gäste page, the guest form and notifications.
* Bad, because a couple could in theory collect answers another way after preparing everything here;
  that is acceptable for a one-time €49 product.
