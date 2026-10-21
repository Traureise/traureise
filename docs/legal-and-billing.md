# Legal pages, account rights and billing

## Impressum, privacy policy and terms

Traureise ships no legal texts and shows none itself: who runs an instance and what it does with data differs for
each one ([ADR 0027](adr/0027-legal-pages-are-links.md)). A public instance in Germany needs an Impressum
(§ 5 DDG) and a privacy policy (Art. 13 DSGVO); with billing on, terms as well. Publish them wherever you publish
pages (your homepage, your own docs) and link them:

```yaml
services:
  app:
    environment:
      IMPRINT_URL: https://example.org/impressum/
      PRIVACY_URL: https://example.org/datenschutz/
      TERMS_URL: https://example.org/agb/
```

- Each is optional; unset, there is no link. Only `http(s)` links are accepted.
- Each one that is set is linked from the app footer ("Impressum", "Datenschutz", "AGB") and from a discreet
  footer on every wedding website and guest page. With billing on, `/preise` also names the terms and the
  privacy policy below the prices.
- The app logs a warning at startup when `IMPRINT_URL` or `PRIVACY_URL` is missing.
- An instance only you use, on your own network, needs none of them.
- Keep the texts in version control: for a privacy policy it matters what it said on which day.

### What to write

That is yours to decide, and worth a lawyer's look. A privacy policy for Traureise usually covers: who is
responsible and how to reach them; where the instance is hosted; the account (email address, first name) and
the wedding websites with their images; the login links (valid 15 minutes, stored only as a hash), sessions
(up to 30 days) and rate-limit entries (purged after 15 minutes); the SMTP provider; S3 storage if used; the
payment provider if billing is on; the two essential cookies (`traureise_session`, optional
`traureise_locale`), so no consent banner is needed ([ADR 0011](adr/0011-no-cookie-banner.md)); that visitors of
wedding websites get no cookies and nothing is stored about them; what is stored about invited guests who
answer through their personal link (names, attendance, events, meal, allergies, which can be health data,
poll answers, requests, messages), that the couple decides about it, that RSVP emails to the couple carry it
through the SMTP provider, and that it is deleted automatically 12 months after the wedding
([Guests and RSVP](guests.md)); for cards: guests' optional email addresses and personal lines, that
Traureise emails cards and reminders on the couple's behalf through the SMTP provider, that it records
whether and how a card was sent and when the household first opened it on its own page (no tracking
pixels), that every email has a one-click unsubscribe which deletes the address, and that all of this is
deleted with the guest list ([Save the Dates, invitations and cards](cards.md)); how long backups keep
deleted data; and
which rights people have, including the self-service export and deletion under `/konto`.

## Account rights

Under **Konto** (`/konto`) users can:

- download all their data as a ZIP: `data.json` with the account, every website with its sections,
  items, purchases and guest list (RSVP settings, polls, households with people, answers and requests),
  plus every uploaded image under `images/`;
- delete their account by typing their email address. This removes all their websites, items, images
  (also from storage), guest lists, purchases, sessions and login traces, and logs them out.

## Billing

Billing is for operators who run Traureise as a paid service. It is off by default; without it, no
prices, plans or locks appear anywhere.

1. Create one one-time product per tier in [Creem](https://www.creem.io) and note the product ids.
2. In Creem's developer settings, add a webhook to `<APP_URL>/api/billing/webhook` and copy its secret.
3. Set `BILLING_ENABLED=true`, `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET` and the `CREEM_PRODUCT_*` ids. Use
   `CREEM_API_URL=https://test-api.creem.io` with a test key first.
4. Keep `PRICE_*_EUR` equal to the product prices; they are what `/preise` shows.

A purchase attaches to one wedding and lasts until 12 months after the wedding date (or after the
purchase if no date is set). Refunds and chargebacks revoke it. The RSVP tier unlocks sending guest links
([Guests and RSVP](guests.md)) and Save the Dates; Einladungen unlocks invitations, email sending and
reminders, and Komplett the thank-you card and the engagement announcement ([cards](cards.md)). A tier
without a product id is shown as "bald verfügbar" and cannot be bought.

**Upgrades pay the difference.** A wedding that already has a tier and buys a higher one is credited the
current `PRICE_*_EUR` of the tier it holds (that price covers the lower tiers bought before it), so RSVP → Komplett
costs 149 − 49 = 100 €. The checkout uses the higher tier's usual product with Creem's `custom_price` (cents,
one-time products only); nothing else needs setting up. Upgrades that would cost less than 1 € are not offered.
`/preise` shows each wedding its own price. Each purchase stays its own entitlement: refunding an upgrade revokes
only the upgrade, and the wedding keeps the tier it had. Try an upgrade once in Creem's test mode before going live. Creem is the merchant of record and issues the
invoices ([ADR 0013](adr/0013-creem-as-merchant-of-record.md),
[ADR 0014](adr/0014-entitlements-per-website.md)).

To look at purchases, query the database:

```sql
select w.slug, e.tier, e.purchase_ref, e.valid_until, e.revoked_at, e.created_at
from entitlements e join websites w on w.id = e.website_id order by e.created_at desc;
```
