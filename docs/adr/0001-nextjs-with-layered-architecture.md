---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Next.js App Router with a layered architecture

## Context and Problem Statement

Traureise is one web application: an editor UI, public wedding pages, and server logic (auth, uploads,
calendar export). It is meant to be self-hosted and to run as a small SaaS, so it must stay easy to deploy
and easy to change safely. How do we structure the code so that business rules stay testable and
independent of the framework?

## Decision Drivers

* One deployable unit for self-hosters
* Business rules testable without a browser, database or framework
* Server rendering for fast, crawl-safe public pages and a live editor preview

## Considered Options

* Next.js (App Router), with domain, application, infrastructure and UI layers
* Next.js with logic written directly in route handlers and components
* A separate API server plus a single-page app

## Decision Outcome

Chosen option: "Next.js (App Router), with domain, application, infrastructure and UI layers", because it
ships as one container and server components render the public site and the editor preview with the same
component, while the layers keep business rules out of React.

* `src/domain`: pure rules and zod schemas.
* `src/application`: use cases that depend only on ports (interfaces).
* `src/infrastructure`: adapters (Drizzle, SMTP, storage, sharp, theme loader).
* `src/composition/container.ts`: the only place that wires adapters to ports.
* `src/app` and `src/components`: routes, server actions and UI, which only call use cases.

### Consequences

* Good, because every use case is unit-tested with in-memory fakes.
* Good, because adapters can be swapped (for example local or S3 storage) without touching use cases.
* Bad, because there are more files and indirection than in a "fat route handler" app.

### Confirmation

ESLint `no-restricted-imports` rules forbid `src/domain` and `src/application` from importing
infrastructure, framework or UI modules.
