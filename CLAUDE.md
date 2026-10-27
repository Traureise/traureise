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

Release: `git tag -a vX.Y.Z origin/main -m "…" && git push origin vX.Y.Z` publishes `ghcr.io/traureise/traureise:X.Y.Z`
(`.github/workflows/docker.yml`). traureise.de runs a pinned tag from Traureise/stacks (`traureise/compose.yaml`);
upgrading it is a commit there. Migrations run when the container starts.

## Architecture

Layers point inward only; ESLint enforces the import bans:

- `src/domain/`: pure rules and zod schemas (no app/infra/next/react/drizzle imports). The paid-feature
  gate is `canUse(feature, context, now)` in `domain/billing.ts` (`FEATURE_TIERS`, `RELEASED_TIERS`).
- `src/application/`: use-case classes (`new X(deps).execute(...)`) depending only on ports in
  `ports.ts`, bundled as `Deps` (`deps.ts`). Access checks go through `loadWedding`/`loadWebsite`/`loadCardVersion`
  in `owned.ts` with a minimum role (`admin` > `editor`; no membership is a `NotFoundError`). Errors in `errors.ts`.
- `src/infrastructure/`: Drizzle repositories, SMTP, storage (local/S3), Creem, themes.
- `src/composition/container.ts`: the only place wiring adapters to ports; `config.ts` is the zod env schema.
- `src/app/` + `src/components/`: thin routes and server actions (`src/app/actions/*`) that call
  `container().<useCase>.execute(...)` wrapped in `runAction` (`src/lib/action-result.ts`).

Data: everything in a wedding hangs off `weddings.id` with `ON DELETE CASCADE`; users reach weddings through
`wedding_members` (role per wedding). Deleting a user removes memberships, not weddings: account deletion
(`application/account.ts`) deletes the weddings the user was the only member of.
Tests: unit tests use hand-written fakes in `tests/fakes/index.ts`; integration tests in `tests/integration/`.
E2E fixture (`e2e/fixtures.ts`) fails any test whose browser hits a non-app host; magic links are read
from Mailpit (`e2e/helpers/`). Billing E2E uses the Creem stub in `e2e/creem-stub/`.

## Rules

- Never write the reference app's name or domain anywhere committed or published (`.secrets/reference.env`;
  `npm run check:names`). Never commit `.secrets/` or `docs/superpowers/`.
- No hardcoded UI strings in `.tsx` (lint rule): copy goes in `messages/de.json`.
- No runtime third-party requests (fonts via `@fontsource`, no CDNs, no analytics). Only exception: the couple's
  OpenStreetMap location picker, loaded after consent (ADR 0026).
- Legal texts are not in the app: it only links `IMPRINT_URL`/`PRIVACY_URL`/`TERMS_URL` (ADR 0027).
- No skipped tests, Playwright `retries: 0`.
- traureise.de holds real users' data: every schema change is a Drizzle migration that keeps existing rows valid
  (with a data migration where needed).
- An env var in `src/composition/config.ts` that an operator must set also goes into `.env.example` here and in
  Traureise/stacks (`traureise/.env.example`).
- Workflow: one issue per version, branch `traureise-<n>-<topic>`, commits prefixed `TRAUREISE #<n>: `,
  ADRs in `docs/adr/` (MADR, numbered), PRs left open for the owner to merge.
