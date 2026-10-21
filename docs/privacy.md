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
| Guest list: households, names, child flag, answers (attendance, events, meal, allergies, poll answers), requests to bring someone, messages | RSVP for the couple | Until the couple deletes them, the website or the account is deleted, or automatically at the end of the RSVP package (12 months after the wedding) |
| Hash of each household's link | Finding the household behind a link | As long as the household |
| A household's email address (optional) and personal line for the thank-you card | Cards and reminders by email; the thank-you card | With the guest list; an unsubscribe clears the address at once |
| Per card and household: left out, when and how it was sent (email, WhatsApp, copied link), email errors, reminders sent, when it was first opened | The couple's overview of who got and opened which card | With the guest list |
| Cards: design, texts, photo | The cards | Until the card, website or account is deleted |
| Rate-limit entries for answers (link hash or client address, time) | Protection against abuse | Deleted with the next answer or login request once older than 15 minutes |

Allergies and intolerances can be health data (Art. 9 DSGVO). They are only asked for so the couple can
tell the caterer, appear only to the couple (overview, CSV export) and are deleted with the rest of the
guest list. Guests have no account and get no cookies; their personal link is the only key, and the form
sends `Referrer-Policy: no-referrer` and `noindex`. See [Guests and RSVP](guests.md).

Photos are re-encoded on upload, which strips EXIF data such as GPS positions and camera details.
Deleting a website deletes its photos from storage.

"Opened" is recorded when the household's own page shows a card (the envelope is opened), by the page
itself. Emails carry no tracking pixel, no read receipt and no wrapped links; the card image is attached,
not loaded from a server. See [ADR 0022](adr/0022-opened-status-without-tracking.md).

## Cookies

Only technically necessary cookies: the session cookie (`traureise_session`, httpOnly, SameSite=Lax,
`Secure` on HTTPS) and, optionally, a language choice (`traureise_locale`). No tracking cookies, so no
consent banner is needed for them.

## No third parties at runtime

- No analytics, no tracking, no ads.
- Fonts and scripts are bundled and served by the instance. Nothing is loaded from CDNs or Google Fonts.
- QR codes are generated in the browser.
- Map links point to OpenStreetMap and are only followed when a guest clicks them.
- The one exception, and only for the couple, never for guests: the place of an event can be found on an
  OpenStreetMap map in the Ablauf. Nothing is loaded until the couple clicks **Karte laden** after a notice
  that their IP address goes to the OpenStreetMap Foundation (tiles from `tile.openstreetmap.org`, search via
  `nominatim.openstreetmap.org`). **Immer laden** remembers that choice in the browser (`localStorage`, no
  cookie). Without it, the venue and address fields work as before. Mention it in your privacy policy if your
  couples use it ([ADR 0026](adr/0026-openstreetmap-location-picker-after-consent.md)).
- Public wedding websites send `noindex`, so search engines don't list them.

Every end-to-end test fails if the browser contacts any host other than the instance (the location test
answers OpenStreetMap's requests itself). The decision
and its reasons are in [ADR 0005](adr/0005-gdpr-no-runtime-third-party-requests.md).

## Your processors

What leaves your server depends on your configuration: your SMTP provider (login emails, RSVP
notifications to the couple, which contain guests' names, answers and messages, and cards and reminders to
guests' email addresses) and, if you
use it, your S3 provider (photos). Prefer EU providers and sign data processing agreements with them.

## Cookies, legal pages and account rights

Traureise sets only two technically necessary cookies (`traureise_session`, and optionally
`traureise_locale`), so it needs no consent banner. The operator publishes the privacy policy and links it with
`PRIVACY_URL`, and users can export or delete all their data themselves
under `/konto`. See [Legal pages, account rights and billing](legal-and-billing.md).
