# Development and tests

## Local setup

Requirements: Node.js 24 and Docker.

```bash
npm ci
cp .env.example .env
docker compose up -d postgres mailpit   # database and mail catcher
DATABASE_URL=postgres://traureise:<password>@localhost:5432/traureise npm run db:migrate
DATABASE_URL=postgres://traureise:<password>@localhost:5432/traureise SMTP_HOST=localhost \
  STORAGE_LOCAL_DIR=./data/uploads npm run dev
```

## Scripts

| Script | What it does |
|---|---|
| `npm run lint` | ESLint, including a rule that forbids hardcoded UI strings and rules that keep the layers apart |
| `npm run typecheck` | TypeScript in strict mode |
| `npm run test:unit` | Vitest: domain rules and use cases with in-memory fakes |
| `npm run test:integration` | Vitest against the Compose PostgreSQL and Mailpit. It creates and migrates a separate `traureise_test` database. |
| `npm run test:e2e` | Playwright against the running E2E stack (`docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait` first). Run `npx playwright install chromium` once. |
| `npm run db:generate` | Generates a migration after changing `src/infrastructure/db/schema.ts` |

## Test levels

- **Unit tests** cover every domain rule and every use case, with hand-written in-memory fakes for the
  ports.
- **Integration tests** run the Drizzle repositories against a real PostgreSQL with the real migrations,
  send email through Mailpit, and process real images with sharp.
- **End-to-end tests** run in Chromium against `docker compose up`. They log in through magic links read
  from the Mailpit API and cover the dashboard, every editor section and field with the live preview,
  the public page, calendar export, sharing, theming, authorization, deletion and logout, plus the legal
  pages, data export and account deletion, and guests and RSVP (guest list, settings, polls, preview,
  answers through personal links, isolation between households, overview, CSV and account export,
  notification email, reply-by date and retention). Every E2E test fails if the browser makes a request to
  a host other than the app; guest browsers opened by a test are checked the same way.
- **Clock and jobs in E2E.** Both instances in `docker-compose.e2e.yml` run with `TEST_HOOKS=true` and
  `GUEST_JOBS_INTERVAL_MINUTES=0`. Tests move the app's clock with `POST /api/test/clock` (`{"offsetDays": n}`,
  reset to 0 in a `finally`) and run the guest jobs for their own website with `POST /api/test/jobs`
  (`{"websiteId": "…"}`), so they never touch other tests' data.
- **Billing E2E tests** (`*.billing.spec.ts`) run against a second app instance from
  `docker-compose.e2e.yml` (port 3001) with billing on, a fictitious operator, and a local Creem stub
  (`e2e/creem-stub/`, port 4010) that plays the checkout page and sends signed webhooks. The checkout
  test is the only one allowed to visit the stub's host. The default instance checks that billing is
  invisible when it is off.

No test is skipped, and Playwright runs with `retries: 0`, so flaky tests show up instead of being
hidden.

## Continuous integration

GitHub Actions runs everything on every pull request (`.github/workflows/ci.yml`). The E2E job starts
the stack from `.env.example`, just like a fresh install, with `docker-compose.e2e.yml` on top for the
billing instance and the Creem stub.
`.github/workflows/docker.yml` builds the image for every pull request and publishes it to
`ghcr.io/traureise/traureise` from `main` and from `v*` tags. `.github/workflows/pages.yml` builds this
documentation with `mkdocs build --strict` and publishes it.

## Working on the docs

```bash
uvx --with mkdocs-material==9.7.7 --with 'mkdocs<2' mkdocs serve
```

The site is at <http://127.0.0.1:8000>. Diagrams are [Mermaid](https://mermaid.js.org) blocks in the
Markdown.
