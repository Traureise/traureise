---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Creem as merchant of record behind a PaymentProvider port

## Context and Problem Statement

The author runs Traureise as a paid service for German-speaking couples with one-time prices per
wedding. Selling digital services to consumers across the EU means VAT in each buyer's country,
invoices, refunds and chargebacks. How does Traureise take payments without becoming a tax and
payments operation, and without tying the code to one provider?

## Decision Drivers

* An EU-based provider, since payment data is personal data
* A merchant of record that sells in its own name, issues invoices and handles VAT
* Self-hosted instances must work without any billing at all
* E2E tests must never call a real payment API

## Considered Options

* Creem (Armitage Labs OÜ, Estonia) as merchant of record
* A payment processor (for example Stripe) with Traureise as the seller
* Another merchant of record outside the EU

## Decision Outcome

Chosen option: "Creem", because it is an EU merchant of record the author already uses, so invoices,
VAT and refunds are handled by Creem.

* The `PaymentProvider` port has two operations: `createCheckout` (a hosted checkout for a website and
  tier) and `parseWebhook` (verify the signature, then map the event to `paid`, `revoked` or
  `ignored`). `CreemPaymentProvider` implements it with `fetch` and an HMAC-SHA256 check of the raw body
  (`creem-signature`), compared in constant time.
* The tier is taken from the configured product id, never from metadata the buyer could influence;
  metadata only carries the website id.
* Billing is off unless `BILLING_ENABLED=true` and both Creem keys are set. Without it, the container
  has no provider, the webhook route returns 404, and no price, plan or lock appears.
* In E2E, a second app instance talks to a small local stub (`e2e/creem-stub/`) that implements the
  checkout endpoint, a hosted test checkout page and signed webhooks in Creem's shape.

### Consequences

* Good, because Traureise never sees card data and issues no invoices.
* Good, because another provider means one new adapter plus its config; use cases and UI stay as
  they are.
* Bad, because buyers leave the instance for the provider's checkout page (a deliberate navigation,
  like the OpenStreetMap links). The operator's privacy policy has to name the provider when billing is on.

## More Information

Adding a provider: implement `PaymentProvider` in `src/infrastructure/payments/`, map its events to
`PaymentEvent`, choose it in `src/composition/container.ts`, and route its webhook to
`HandlePaymentWebhook`.
