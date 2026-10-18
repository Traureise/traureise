---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Background jobs run inside the app, idempotent and claimed in the database

## Context and Problem Statement

Retention (ADR 0017), the 30-day warning and the daily summary email need something that runs on a
schedule. Self-hosters start Traureise with one `docker compose up`; a hosted instance may run several
app containers.

## Considered Options

* A separate scheduler service (cron container) calling an endpoint
* A job queue (for example pg-boss)
* A timer started from `instrumentation.ts` in every instance, with idempotent work

## Decision Outcome

Chosen option: "A timer in every instance".

* `instrumentation.ts` runs `RunGuestJobs` one minute after start and then every
  `GUEST_JOBS_INTERVAL_MINUTES` (default 15; 0 turns it off). Errors are logged and never crash the app.
* Deleting is idempotent. Every email is claimed first with a conditional update (compare-and-set on
  `last_summary_at`, `retention_warned_for` distinct from the date), so two instances never send twice.
* Daily summaries go out once a day from 8:00 in the website's timezone and only when something changed.
* E2E tests set the interval to 0 and call `POST /api/test/jobs` for their own website, with the clock
  moved by `POST /api/test/clock`. Both exist only with `TEST_HOOKS=true`, which logs a warning.

### Consequences

* Good, because there is nothing extra to deploy or configure.
* Good, because jobs are plain use cases with unit and integration tests.
* Bad, because jobs only run while an app instance runs; a stopped instance catches up on its next start.
