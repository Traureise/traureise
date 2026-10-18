# Traureise

Traureise is a self-hostable, open-source wedding website builder. Couples log in with a magic link,
build their wedding website in an editor with a live preview, and share it with guests by link or QR code.
It is German-first and built so that guests' and couples' data never leaves your instance.

**Documentation: <https://docs.traureise.de>** — quick start, configuration, email, storage, HTTPS,
backups, themes, architecture and design decisions. The sources are in [`docs/`](docs).

## Features (v1)

- Passwordless login by email link. An account is created on first login.
- Dashboard with website cards, a share dialog (QR code and link) and deletion.
- Editor with a live preview: the home section and eight sections (story, schedule, travel,
  recommendations, registry, wedding party, gallery, FAQ). Show, hide and rename sections; add, edit,
  delete and reorder items.
- Public wedding website with anchor navigation, OpenStreetMap links, calendar export (`.ics`) and
  Open Graph tags.
- Themes are data: add a folder to `themes/` ([how](https://docs.traureise.de/themes/)).
- Privacy by design: no analytics, no CDNs, no third-party requests at runtime; uploaded photos lose
  their EXIF data.

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

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm run test:unit
docker compose up -d --build && npm run test:integration && npm run test:e2e
```

Details: [Development and tests](https://docs.traureise.de/development/).

## License

[AGPL-3.0-or-later](LICENSE). You may run, change and share Traureise. If you offer a modified version
as a service, you must make your changes available to its users.

All bundled fonts are under the SIL Open Font License (from the `@fontsource` packages).
