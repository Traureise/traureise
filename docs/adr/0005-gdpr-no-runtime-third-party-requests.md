---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# GDPR: customer data stays on the instance, no runtime third-party requests

## Context and Problem Statement

Traureise is run as a GDPR-compliant SaaS for German-speaking couples, as an alternative to US-hosted
providers. Couples' accounts, wedding content, photos, and the IP addresses of their guests are personal data.
Which external services may the app use?

## Decision Drivers

* No transfer of personal data to processors outside a GDPR-compliant setup
* Loading Google Fonts from Google's servers in the visitor's browser has been ruled a GDPR violation in
  Germany (LG München I, 3 O 17493/20)
* Self-hosters should get the same privacy without any extra configuration

## Considered Options

* No runtime requests to third parties; resources are bundled at build time and served by the instance
* Allow common CDNs, embedded maps and hosted fonts

## Decision Outcome

Chosen option: "No runtime requests to third parties", because a browser request to a third party
transfers the visitor's IP address.

* Fonts come from `@fontsource` npm packages and are served by the app. Using Google Fonts via
  `next/font/google` would also be fine, since it downloads them at build time.
* No analytics, no tracking, no CDNs, no embedded maps. "Karte ansehen" is a plain link to OpenStreetMap
  that the guest chooses to follow.
* QR codes are generated in the browser. Images are stored by the instance (local volume or an
  S3-compatible bucket of the operator's choice) and served by the app.
* Email goes through any SMTP server configured by the operator.
* Public wedding pages send `noindex`. Next.js telemetry is disabled in the image.

### Consequences

* Good, because the app works the same offline and in air-gapped setups.
* Bad, because rich embeds (for example interactive maps) are out of scope unless they are self-hosted.

### Confirmation

An auto-used Playwright fixture fails every E2E test if the browser requests any host other than the
instance.
