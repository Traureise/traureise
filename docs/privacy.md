# Privacy by design

Traureise is built to be run as a GDPR-compliant service for German-speaking couples. This page lists
what it stores, for how long, and what it never does. It describes the software, not your legal
obligations as an operator; have your own privacy policy reviewed.

## What is stored

| Data | Why | How long |
|---|---|---|
| Email address and first name | Login and greeting | Until the account is deleted |
| Hash of each login link, with the email address | Single-use login | Valid 15 minutes; expired links are deleted with the next login request |
| Hash of each session token | Staying logged in | 30 days; expired sessions are deleted with the next login |
| Rate-limit entries (email address or client address, time) | Protection against abuse | Deleted with the next login request once older than 15 minutes |
| Website content and uploaded photos | The wedding website | Until the website or account is deleted |

Photos are re-encoded on upload, which strips EXIF data such as GPS positions and camera details.
Deleting a website deletes its photos from storage.

## Cookies

Only technically necessary cookies: the session cookie (`traureise_session`, httpOnly, SameSite=Lax,
`Secure` on HTTPS) and, optionally, a language choice (`traureise_locale`). No tracking cookies, so no
consent banner is needed for them.

## No third parties at runtime

- No analytics, no tracking, no ads.
- Fonts and scripts are bundled and served by the instance. Nothing is loaded from CDNs or Google Fonts.
- QR codes are generated in the browser.
- Map links point to OpenStreetMap and are only followed when a guest clicks them.
- Public wedding websites send `noindex`, so search engines don't list them.

Every end-to-end test fails if the browser contacts any host other than the instance. The decision
and its reasons are in [ADR 0005](adr/0005-gdpr-no-runtime-third-party-requests.md).

## Your processors

What leaves your server depends on your configuration: your SMTP provider (login emails) and, if you
use it, your S3 provider (photos). Prefer EU providers and sign data processing agreements with them.

## Cookies, legal pages and account rights

Traureise sets only two technically necessary cookies (`traureise_session`, and optionally
`traureise_locale`), so it needs no consent banner. The operator supplies the privacy policy at `/datenschutz`
as a Markdown file, and users can export or delete all their data themselves
under `/konto`. See [Legal pages, account rights and billing](legal-and-billing.md).
