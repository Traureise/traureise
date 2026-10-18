# Legal pages, account rights and billing

## Impressum and privacy policy

Traureise generates `/impressum` (§ 5 DDG) and `/datenschutz` from your configuration. Set at least
`OPERATOR_NAME`, `OPERATOR_ADDRESS` and `OPERATOR_EMAIL` (see [Configuration](configuration.md)).
Until then the instance runs, logs a warning at startup, and both pages say they are not configured.

The privacy policy describes what your instance actually does: hosting, the PostgreSQL database, the
SMTP server, local or S3 storage, the payment provider (only with billing on), the two essential cookies,
and the retention of login and rate-limit data. Name your processors with `PRIVACY_HOSTING_PROVIDER`,
`PRIVACY_SMTP_PROVIDER` and, for S3, `PRIVACY_STORAGE_PROVIDER`.

Both pages are linked from the app footer and from a small footer on every wedding website. There is no
cookie banner because Traureise only sets technically necessary cookies
([ADR 0011](adr/0011-no-cookie-banner.md)).

!!! warning "Have your texts reviewed"
    The generated texts are drafts that describe the software, not legal advice. Have them reviewed by a
    lawyer or a generator service before you go live, and adjust the copy in `messages/de.json`.

## Account rights

Under **Konto** (`/konto`) users can:

- download all their data as a ZIP: `data.json` with the account, every website with its sections,
  items and purchases, plus every uploaded image under `images/`;
- delete their account by typing their email address. This removes all their websites, items, images
  (also from storage), purchases, sessions and login traces, and logs them out.

## Billing

Billing is for operators who run Traureise as a paid service. It is off by default; without it, no
prices, plans or locks appear anywhere.

1. Create one one-time product per tier in [Creem](https://www.creem.io) and note the product ids.
2. In Creem's developer settings, add a webhook to `<APP_URL>/api/billing/webhook` and copy its secret.
3. Set `BILLING_ENABLED=true`, `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET` and the `CREEM_PRODUCT_*` ids. Use
   `CREEM_API_URL=https://test-api.creem.io` with a test key first.
4. Keep `PRICE_*_EUR` equal to the product prices; they are what `/preise` shows.

A purchase attaches to one wedding website and lasts until 12 months after the wedding date (or after the
purchase if no date is set). Refunds and chargebacks revoke it. Tiers whose features are not built yet
are shown as "bald verfügbar" and cannot be bought. Creem is the merchant of record and issues the
invoices ([ADR 0013](adr/0013-creem-as-merchant-of-record.md),
[ADR 0014](adr/0014-entitlements-per-website.md)).

To look at purchases, query the database:

```sql
select w.slug, e.tier, e.purchase_ref, e.valid_until, e.revoked_at, e.created_at
from entitlements e join websites w on w.id = e.website_id order by e.created_at desc;
```
