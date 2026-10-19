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
- Your own Impressum, privacy policy and terms as Markdown files, linked from the app and from every
  wedding website. Traureise ships none of the texts.
- Guests and RSVP: a guest list of households with a personal link each (copy it or send it by
  WhatsApp), a themed answer form (attendance, events, meal, allergies, polls, requests to bring someone,
  a message), an overview with a pie chart and counts, email notifications, CSV export, and automatic
  deletion of guest data 12 months after the wedding ([how](https://docs.traureise.de/guests/)).
- Save the Dates, invitations, thank-you cards and an engagement announcement, with or without a
  website (start with any of them; the website can follow for the same wedding): card layouts from the
  themes, a live-preview editor, an envelope that opens on the household's page, sending by link,
  WhatsApp or email (with one-click unsubscribe), automatic and manual reminders, "opened" per household
  without tracking, and export as PDF (A6, A5) and PNG, rendered on the instance
  ([how](https://docs.traureise.de/cards/)).
- Account rights: download all your data as a ZIP (data.json plus images) and delete your account
  with everything in it, under `/konto`.
- Optional billing for operators who run Traureise as a service: one-time prices per wedding on
  `/preise`, paid through [Creem](https://www.creem.io) as merchant of record. Off by default.

## Quick start

Requirements: Docker with Compose v2.

```bash
git clone https://github.com/Traureise/traureise.git
cd traureise
cp .env.example .env        # then set POSTGRES_PASSWORD and APP_SECRET
docker compose up -d --build
```

- App: <http://localhost:3000>
- Login emails land in the bundled Mailpit inbox: <http://localhost:8025>

For production (real SMTP, HTTPS, backups), follow the
[self-hosting guide](https://docs.traureise.de/getting-started/).

## Legal pages and billing settings

All settings are environment variables in `.env` (see [`.env.example`](.env.example) and the
[configuration reference](https://docs.traureise.de/configuration/)).

**Legal pages.** Traureise ships no Impressum, privacy policy or terms: who runs an instance and what it does
with personal data differs for each one. Write them as Markdown files and point Traureise at them:

```yaml
services:
  app:
    environment:
      IMPRINT_FILE: /legal/impressum.md     # /impressum, "Impressum" in the footers
      PRIVACY_FILE: /legal/datenschutz.md   # /datenschutz, "Datenschutz"
      TERMS_FILE: /legal/agb.md             # /agb, "AGB"
    volumes:
      - ./legal:/legal:ro
```

- Each file is optional. Without one the page is a 404 and nothing links to it. With one, the app footer
  and a discreet footer on every wedding website link to it.
- Files are read on every request, so an edit shows at once. Keep them in version control: for a privacy
  policy it matters what it said on which day.
- Raw HTML in a file is shown as text, and only web, mail and phone links are kept.
- The app logs a warning at startup when `IMPRINT_FILE` or `PRIVACY_FILE` is missing or unreadable.

> **Have your legal texts reviewed.** A privacy policy says who is responsible, where the instance is hosted,
> what it stores (accounts, websites, images, login links for 15 minutes, sessions for 30 days, rate-limit
> entries for 15 minutes), which processors it uses (SMTP, S3, the payment provider) and which rights people
> have. That is yours to write, and worth a lawyer's look.

**Guest links.** Set `APP_SECRET` to a long random value (`openssl rand -base64 48`) before couples send
links, and keep it: each household's personal link is derived from it, so changing it stops every link
already sent. Retention, daily summaries and automatic reminders run inside the app every `GUEST_JOBS_INTERVAL_MINUTES`
(default 15). Your privacy policy should cover what is stored about guests (see the
[guests guide](https://docs.traureise.de/guests/)).

**Emails to guests.** Cards and reminders go out through your SMTP server as `"<couple> über Traureise"`
with the address of `MAIL_FROM` and the couple's address as `Reply-To`, at most `MAIL_BATCH_SIZE` per job
pass with `MAIL_SEND_INTERVAL_MS` between two (defaults 50 and 1000 ms). Use a provider that allows this and
set up SPF, DKIM and DMARC (see [Email](https://docs.traureise.de/email/#emails-to-guests)).

**Billing** (for operators who run Traureise as a paid service; off by default):

| Variable | Purpose |
|---|---|
| `BILLING_ENABLED` | `true` turns billing on, but only together with `CREEM_API_KEY` and `CREEM_WEBHOOK_SECRET`. |
| `CREEM_API_URL`, `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET` | Creem API (`https://test-api.creem.io` for test mode) and webhook secret. Point the Creem webhook at `<APP_URL>/api/billing/webhook`. |
| `CREEM_PRODUCT_RSVP`, `CREEM_PRODUCT_INVITATIONS`, `CREEM_PRODUCT_COMPLETE` | Creem product ids per tier. A tier without a product cannot be bought. |
| `PRICE_RSVP_EUR`, `PRICE_INVITATIONS_EUR`, `PRICE_COMPLETE_EUR` | Prices on `/preise` in euros, VAT included (defaults 49, 139, 149). |
| `BILLING_TEST_UNLOCK_TIERS` | **Testing only.** Sells tiers whose features are not built yet (since v4 all are). Never set it in production. |
| `TEST_HOOKS` | **Testing only.** Lets anyone move the clock and run the guest jobs. Never set it in production. |

Setting up guests and designing cards is free. RSVP activates the personal links, sharing and
notifications; Einladungen adds Save the Dates, invitations, email sending and reminders; Komplett the
thank-you card and the engagement announcement. A tier without a product id is shown as "bald verfügbar"
and cannot be bought. Without billing,
`/preise`, plans and purchases do not appear anywhere.

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
