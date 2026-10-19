# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Traureise: self-hostable, German-first wedding website builder (Next.js App Router, TypeScript strict,
PostgreSQL + Drizzle, next-intl, shadcn/ui). AGPL-3.0-or-later. Docs site sources in `docs/` (MkDocs).

## Commands

```bash
npm run lint && npm run typecheck && npm run test:unit
npx vitest run --config vitest.config.ts tests/unit/domain/slug.test.ts   # one unit test file
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait   # stack for integration + E2E
npm run test:integration          # real Postgres/Mailpit from the stack; uses a separate traureise_test DB
npm run test:e2e                  # Playwright vs. :3000 (default) and :3001 (*.billing.spec.ts, billing on)
npx playwright test e2e/account.spec.ts -g "export"   # one E2E test
npm run db:generate               # after editing src/infrastructure/db/schema.ts (writes drizzle/NNNN_*.sql)
npm run check:names               # reference-name check (see rules)
```

E2E runs against the built Docker image, so rebuild the stack after app changes.

## Architecture

Layers point inward only; ESLint enforces the import bans:

- `src/domain/`: pure rules and zod schemas (no app/infra/next/react/drizzle imports). The paid-feature
  gate is `canUse(feature, context, now)` in `domain/billing.ts` (`FEATURE_TIERS`, `RELEASED_TIERS`).
- `src/application/`: use-case classes (`new X(deps).execute(...)`) depending only on ports in
  `ports.ts`, bundled as `Deps` (`deps.ts`). Ownership checks go through `loadOwnedWebsite`
  (someone else's website is a `NotFoundError`). Errors in `errors.ts`.
- `src/infrastructure/`: Drizzle repositories, SMTP, storage (local/S3), Creem, themes, legal files.
- `src/composition/container.ts`: the only place wiring adapters to ports; `config.ts` is the zod env schema.
- `src/app/` + `src/components/`: thin routes and server actions (`src/app/actions/*`) that call
  `container().<useCase>.execute(...)` wrapped in `runAction` (`src/lib/action-result.ts`).

Data: everything hangs off `users.id` / `websites.id` with `ON DELETE CASCADE`; account export
(`application/account.ts`, `data.json` + images) and deletion rely on that.
Tests: unit tests use hand-written fakes in `tests/fakes/index.ts`; integration tests in `tests/integration/`.
E2E fixture (`e2e/fixtures.ts`) fails any test whose browser hits a non-app host; magic links are read
from Mailpit (`e2e/helpers/`). Billing E2E uses the Creem stub in `e2e/creem-stub/`.

## Rules

- Never write the reference app's name or domain anywhere committed or published (`.secrets/reference.env`;
  `npm run check:names`). Never commit `.secrets/` or `docs/superpowers/`.
- No hardcoded UI strings in `.tsx` (lint rule): copy goes in `messages/de.json`.
- No runtime third-party requests (fonts via `@fontsource`, no CDNs, no analytics).
- Legal texts are not in the app: operators supply Markdown via `IMPRINT_FILE`/`PRIVACY_FILE`/`TERMS_FILE`.
- No skipped tests, Playwright `retries: 0`.
- No instance holds real data yet (development only): schema changes still get a Drizzle migration, but
  existing rows need no data migration or backwards compatibility.
- Workflow: one issue per version, branch `traureise-<n>-<topic>`, commits prefixed `TRAUREISE #<n>: `,
  ADRs in `docs/adr/` (MADR, numbered), PRs left open for the owner to merge.
