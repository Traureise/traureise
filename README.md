# Traureise

Traureise is a self-hostable, open-source wedding website builder. Couples log in with a magic link,
build their wedding website in an editor with a live preview, and share it with guests by link or QR code.
It is German-first and built so that guests' and couples' data never leaves your instance.

**Features (v1)**

- Passwordless login by email link. An account is created on first login.
- Dashboard: website cards, a share dialog (QR code download/copy, link copy), deletion, and placeholder
  tabs for upcoming products (Save the Dates, invitations, cards).
- Editor at `/websites/<id>/edit` with a live preview. You can edit the home section (cover image, date,
  location, welcome text, hashtag, countdown, web address, time zone) and eight sections: Unsere Geschichte,
  Tagesablauf, Anreise, Empfehlungen, Geschenkideen, Hochzeitsgesellschaft, Galerie and Häufige Fragen.
  Each section can be shown, hidden and renamed. Items can be added, edited, deleted and moved up or down.
- Public website at `/<web-address>` with anchor navigation, OpenStreetMap links, calendar export (`.ics`)
  and Open Graph tags. Public pages ask search engines not to index them.
- Themes are data: drop a folder into `themes/` (see [docs/themes.md](docs/themes.md)).
- Privacy: no analytics, no CDNs, and no fonts or scripts from third parties at runtime. Fonts are bundled.
  Uploaded images are re-encoded, which strips EXIF data such as GPS positions.

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

Database migrations run automatically every time the app container starts.

## Configuration

All settings are environment variables, read from `.env` by `docker-compose.yml`.

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Public URL of the instance, used in login and share links. If it starts with `https://`, the session cookie is marked `Secure`. |
| `APP_PORT` | `3000` | Host port the app is published on. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `traureise` / – / `traureise` | Credentials for the bundled PostgreSQL. The app's `DATABASE_URL` is built from these. |
| `POSTGRES_PORT` | `5432` | Host port for PostgreSQL, bound to `127.0.0.1` only (used by the integration tests). |
| `SMTP_HOST` / `SMTP_PORT` | `mailpit` / `1025` | SMTP server for login emails. |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (usually port 465). With `false`, STARTTLS is used when the server offers it. |
| `SMTP_USER` / `SMTP_PASSWORD` | empty | SMTP credentials. Leave empty for servers without authentication. |
| `MAIL_FROM` | `Traureise <no-reply@traureise.localhost>` | Sender of login emails. |
| `STORAGE_DRIVER` | `local` | `local` (Docker volume) or `s3` (any S3-compatible service). |
| `STORAGE_LOCAL_DIR` | `/data/uploads` | Upload directory inside the container, backed by the `uploads` volume. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | empty, `true` | S3 settings when `STORAGE_DRIVER=s3`. |
| `THEMES_DIR` | `./themes` | Directory with theme packages (see [docs/themes.md](docs/themes.md)). |
| `MAILPIT_UI_PORT` / `MAILPIT_SMTP_PORT` | `8025` / `1025` | Host ports of the bundled Mailpit, bound to `127.0.0.1`. |

### Email (SMTP)

The bundled Mailpit only catches emails, which is good for trying things out and for tests. For real use:

1. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` for your
   provider. For GDPR, prefer an EU provider and sign a data processing agreement (AVV) with it.
2. Remove the `mailpit` service, and the `depends_on` entry that points to it, from `docker-compose.yml`,
   or keep it if you want a catch-all inbox.
3. Configure SPF, DKIM and DMARC for the sender domain, so login links don't end up in spam.

Magic links are valid for 15 minutes and work once. Login requests are rate-limited to 5 per email address
and 20 per client address in 15 minutes.

### File storage

Uploaded images are validated (JPEG, PNG, WebP, GIF or AVIF, up to 10 MB), then re-encoded to WebP at
2400 px at most, which removes EXIF/GPS metadata. The app serves them itself under `/uploads/<key>`;
nothing links to a storage host directly.

- **local** (default): files live in the `uploads` Docker volume.
- **s3**: any S3-compatible object storage (for example an EU-hosted provider). Create a private bucket and
  set `STORAGE_DRIVER=s3` and the `S3_*` variables. Most non-AWS providers need `S3_FORCE_PATH_STYLE=true`.

### HTTPS and reverse proxy

Run Traureise behind a reverse proxy that terminates TLS, such as Caddy, Traefik or nginx, and set
`APP_URL=https://your-domain`. The proxy must append the client address to `X-Forwarded-For`; the login rate
limit uses the last entry of that header. Do not publish port 3000 directly to the internet, or clients can
pick their own rate-limit bucket.

## Backups

Everything worth backing up is in two places: the PostgreSQL database and the uploaded images.

```bash
# Database
docker compose exec -T postgres pg_dump -U traureise -Fc traureise > traureise-$(date +%F).dump
# Uploads (local storage)
docker run --rm -v traureise_uploads:/data -v "$PWD":/backup debian:bookworm-slim \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

Restore:

```bash
docker compose exec -T postgres pg_restore -U traureise -d traureise --clean --if-exists < traureise-2026-10-18.dump
docker run --rm -v traureise_uploads:/data -v "$PWD":/backup debian:bookworm-slim \
  tar xzf /backup/uploads-2026-10-18.tar.gz -C /data
```

With S3 storage, back up the bucket with your provider's tools (for example versioning or replication).
Keep backups encrypted; they contain personal data.

## Development

Requirements: Node.js 24 and Docker.

```bash
npm ci
cp .env.example .env
docker compose up -d postgres mailpit   # database and mail catcher for local work
DATABASE_URL=postgres://traureise:<password>@localhost:5432/traureise npm run db:migrate
DATABASE_URL=postgres://traureise:<password>@localhost:5432/traureise SMTP_HOST=localhost \
  STORAGE_LOCAL_DIR=./data/uploads npm run dev
```

| Script | What it does |
|---|---|
| `npm run lint` | ESLint, including a rule that forbids hardcoded UI strings and rules that keep the layers apart |
| `npm run typecheck` | TypeScript in strict mode |
| `npm run test:unit` | Vitest: domain rules and use cases with in-memory fakes |
| `npm run test:integration` | Vitest against the Compose PostgreSQL and Mailpit. It creates and migrates a separate `traureise_test` database. |
| `npm run test:e2e` | Playwright against the running Compose stack (`docker compose up -d --build` first). Run `npx playwright install chromium` once. |
| `npm run db:generate` | Generates a migration after changing `src/infrastructure/db/schema.ts` |

Every E2E test fails if the browser makes a request to any host other than the app itself.

GitHub Actions runs all of this on every pull request (`.github/workflows/ci.yml`). The E2E job starts the
stack with `docker compose up` from `.env.example`, just like a fresh install.
`.github/workflows/docker.yml` builds the image for every pull request and publishes it to
`ghcr.io/traureise/traureise` from `main` and from `v*` tags.

### Architecture

```
src/domain          pure rules and zod schemas (slugs, sections, calendar, themes, fonts)
src/application     use cases, depending only on ports (interfaces)
src/infrastructure  Drizzle repositories, SMTP, storage, image processing, theme loader
src/composition     composition root: wires adapters to ports
src/app, components Next.js routes, server actions and UI: thin, calling use cases only
themes/             theme packages (data)
messages/           translations (next-intl). Only `de` is complete.
```

Decisions are recorded in [docs/adr](docs/adr).

### Adding a language

1. Copy `messages/de.json` to `messages/<locale>.json` (for example `en.json`) and translate every value.
2. Add the locale to `locales` in `src/i18n/config.ts`.

The UI language then follows the `traureise_locale` cookie if it is set, otherwise the browser's
`Accept-Language` header, otherwise German. Theme names are translated inside each theme's `theme.json`.
Wedding websites are shown in the visitor's language the same way. Login emails always use German for now.

## Fonts

All fonts are open-licensed (SIL Open Font License) and bundled from the `@fontsource` packages. The
license texts ship in `node_modules/@fontsource*/*/LICENSE`.
