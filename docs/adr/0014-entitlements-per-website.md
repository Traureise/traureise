---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Entitlements per wedding website and one feature gate

> Since ADR 0023 the entitlements belong to the **wedding** (`entitlements.wedding_id`), not to a website:
> one wedding has several website versions and card versions, and one package covers all of them. The rest of
> this decision is unchanged.

## Context and Problem Statement

Paid tiers are bought once per wedding, not per account and not as a subscription. Later phases add
the paid features (RSVP in v3, invitations and cards in v4). How are purchases stored, and how does the
code decide whether a feature is available?

## Considered Options

* Entitlement rows per website, checked by one domain rule `canUse(feature, website, now)`
* A plan column on the website
* Checks scattered through use cases and components

## Decision Outcome

Chosen option: "Entitlement rows per website with one rule", because it keeps purchase history,
supports refunds, and gives v3 and v4 one place to ask.

* `entitlements`: website, tier, provider, purchase reference (the provider's order id, unique) and
  `valid_until`, plus `revoked_at` for refunds and chargebacks. Rows cascade with their website.
* `valid_until` is the end of the day 12 months after the wedding date, or 12 months after the purchase
  when no date is set (or the wedding is already further back), fixed at purchase time so later date
  changes cannot extend it.
* Tiers are ordered (website < RSVP < Einladungen < Komplett); each includes the previous ones.
  `canUse` returns true for everything when billing is off, true for free features, and otherwise
  needs an active entitlement of at least the feature's tier.
* A tier is sold only when all its features are released (none of the paid ones in v2, so they show as
  "bald verfügbar") and only above what the website already has. `StartCheckout` enforces this on the
  server. `BILLING_TEST_UNLOCK_TIERS` lets the E2E stack sell a tier before its release and must never
  be set in production.
* Webhooks are idempotent: the event id goes into `billing_events` in the same transaction as the
  change, so a replay is ignored while a failed attempt can be retried. Because the purchase reference
  stays unique after a refund, a replayed payment can never grant a refunded purchase again. Events
  that cannot be applied (deleted website, unknown product) are still acknowledged, so the provider
  stops retrying.

### Consequences

* Good, because v3 and v4 only call `canUse` and add features to `FEATURE_TIERS`.
* Bad, because upgrades cost the full price of the higher tier; there is no proration (out of scope).
