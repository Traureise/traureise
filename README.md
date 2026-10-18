# Traureise

Traureise is a self-hostable, open-source wedding website builder. Couples log in with a magic link,
build their wedding website in an editor with a live preview, and share it with guests by link or QR code.
It is German-first and built so that guests' and couples' data never leaves your instance.

**Documentation: <https://docs.traureise.de>** — quick start, configuration, email, storage, HTTPS,
backups, themes, architecture and design decisions. The sources are in [`docs/`](docs).

## Features

- Passwordless login by email link. An account is created on first login.
- Dashboard with website cards, a share dialog (QR code and link) and deletion.
- Editor with a live preview: the home section and eight sections (story, schedule, travel,
  recommendations, registry, wedding party, gallery, FAQ). Show, hide and rename sections; add, edit,
  delete and reorder items.
- Public wedding website with anchor navigation, OpenStreetMap links, calendar export (`.ics`) and
  Open Graph tags.
- Themes are data: add a folder to `themes/` ([how](https://docs.traureise.de/themes/)).
- Privacy by design: no analytics, no CDNs, no third-party requests at runtime; uploaded photos lose
  their EXIF data. Only technically necessary cookies, so no cookie banner.
- Impressum and privacy policy generated from the operator's configuration, linked from the app and
  from every wedding website.
- Account rights: download all your data as a ZIP (data.json plus images) and delete your account
  with everything in it, under `/konto`.
- Optional billing for operators who run Traureise as a service: one-time prices per wedding on
  `/preise`, paid through [Creem](https://www.creem.io) as merchant of record. Off by default.

## Quick start

Requirements: Docker with Compose v2.

```bash
git clone https://github.com/Traureise/traureise.git
cd traureise
cp .env.example .env        # then set POSTGRES_PASSWORD
docker compose up -d --build
```

- App: <http://localhost:3000>
- Login emails land in the bundled Mailpit inbox: <http://localhost:8025>

For production (real SMTP, HTTPS, backups), follow the
[self-hosting guide](https://docs.traureise.de/getting-started/).

## Operator, privacy and billing settings

All settings are environment variables in `.env` (see [`.env.example`](.env.example) and the
[configuration reference](https://docs.traureise.de/configuration/)). Anyone who runs a public instance
must show their own legal details, so these come from configuration, never from code.

| Variable | Required | Shown as |
|---|---|---|
| `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL` | yes | Impressum (§ 5 DDG) and controller in the privacy policy. `OPERATOR_ADDRESS` is comma-separated. |
| `OPERATOR_BUSINESS_NAME`, `OPERATOR_PHONE` | no | Impressum. |
| `OPERATOR_VAT_ID` or `OPERATOR_VAT_NOTE` | no | VAT ID (§ 27a UStG), or a note such as the § 19 UStG small-business statement. |
| `OPERATOR_CONTENT_RESPONSIBLE` | no | Person responsible for content (§ 18 Abs. 2 MStV); defaults to `OPERATOR_NAME`. |
| `OPERATOR_DISPUTE_RESOLUTION` | no | Consumer dispute-resolution statement (§ 36 VSBG), shown as written. |
| `PRIVACY_HOSTING_PROVIDER`, `PRIVACY_SMTP_PROVIDER`, `PRIVACY_STORAGE_PROVIDER` | no | Processors named in the privacy policy; neutral wording when empty. |
| `BILLING_ENABLED` | no | `true` turns billing on, but only together with `CREEM_API_KEY` and `CREEM_WEBHOOK_SECRET`. |
| `CREEM_API_URL`, `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET` | with billing | Creem API (`https://test-api.creem.io` for test mode) and webhook secret. Point the Creem webhook at `<APP_URL>/api/billing/webhook`. |
| `CREEM_PRODUCT_RSVP`, `CREEM_PRODUCT_INVITATIONS`, `CREEM_PRODUCT_COMPLETE` | with billing | Creem product ids per tier. A tier without a product cannot be bought. |
| `PRICE_RSVP_EUR`, `PRICE_INVITATIONS_EUR`, `PRICE_COMPLETE_EUR` | no | Prices on `/preise` in euros, VAT included (defaults 49, 139, 149). |
| `BILLING_TEST_UNLOCK_TIERS` | no | **Testing only.** Sells tiers whose features are not built yet. Never set it in production. |

If the required operator values are missing, the instance still runs, logs a warning at startup, and
`/impressum` and `/datenschutz` say that they are not configured. A tier whose features do not exist yet
is shown as "bald verfügbar" and cannot be bought. Without billing, prices, plans and purchases do not
appear anywhere.

> **Have your legal texts reviewed.** The Impressum and privacy policy are generated drafts that describe
> what the software does. They are not legal advice. Before you run a public instance, have them checked
> by a lawyer or a generator service and adjust the copy in `messages/de.json` where needed.

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm run test:unit
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait
npm run test:integration && npm run test:e2e
```

Details: [Development and tests](https://docs.traureise.de/development/).

## License

Traureise is free software under the [GNU Affero General Public License, version 3 or later](LICENSE)
(AGPL-3.0-or-later). You may run, study, change and share it.

If you run a modified version as a network service (for example a public instance with your own
changes), section 13 of the AGPL requires you to offer the users of that service the complete source
code of your version under the same license. The footer links to the source; point `SOURCE_CODE_URL`
at your own repository. Running the
unmodified version needs nothing beyond keeping the license and copyright notices.

All bundled fonts are under the SIL Open Font License (from the `@fontsource` packages).
