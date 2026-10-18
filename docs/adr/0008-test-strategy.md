---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Test strategy: unit, integration and E2E on the real stack

## Context and Problem Statement

The app handles authentication, ownership and personal data, and it must keep working when self-hosted
with Docker Compose. Which tests give confidence without being slow or flaky?

## Considered Options

* Three levels: unit tests with fakes, integration tests against real services, and E2E against the Compose stack
* Mostly E2E tests
* Unit tests with mocks only

## Decision Outcome

Chosen option: "Three levels", because each level catches what the others cannot.

* **Unit (Vitest):** all domain rules and all use cases, with hand-written in-memory fakes for the ports
  (`tests/fakes`). The fakes return copies, like a database would.
* **Integration (Vitest):** Drizzle repositories against a fresh PostgreSQL database with the real
  migrations applied; SMTP via Mailpit; sharp, local storage and the theme loader on real files.
* **E2E (Playwright):** run against `docker compose up`. They log in through magic links read from the
  Mailpit API and cover the full flow: dashboard, every editor section with the live preview, the public page,
  `.ics` export, sharing, theming, authorization, deletion and logout. An auto fixture fails any test that
  makes a third-party request.

Rules: no skipped tests and no retries (`retries: 0`, `forbidOnly`). Tests use unique emails and
per-test client addresses, so they don't share state or rate-limit buckets.

### Consequences

* Good, because the Compose setup that self-hosters use is exactly what the E2E suite tests.
* Bad, because integration and E2E tests need Docker running locally.
