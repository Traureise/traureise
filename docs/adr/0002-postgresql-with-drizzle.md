---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# PostgreSQL with Drizzle ORM and versioned migrations

## Context and Problem Statement

We need durable storage for accounts, sessions, websites, sections, items and upload metadata. It has to
run self-hosted in Docker and be easy to back up. Data export and account deletion will follow later.

## Considered Options

* PostgreSQL with Drizzle ORM
* PostgreSQL with Prisma
* SQLite

## Decision Outcome

Chosen option: "PostgreSQL with Drizzle ORM", because PostgreSQL is a robust, widely hosted, EU-friendly
default with mature backup tooling (`pg_dump`). Drizzle gives type-safe SQL without a separate
engine binary, and generates plain SQL migrations that we review and commit (`drizzle/`).

Section items are one table with a validated `jsonb` column per item. The zod schemas in
`src/domain/sections.ts` are the contract, so adding a field does not need a migration. Every
user-owned table cascades from `users.id`, so deleting an account is a single delete.

### Consequences

* Good, because migrations run automatically when the app container starts, using drizzle-orm's runtime
  migrator.
* Good, because repositories are integration-tested against a real PostgreSQL with the real migrations.
* Bad, because `jsonb` item data cannot be constrained by the database itself; validation happens in the
  domain layer.
