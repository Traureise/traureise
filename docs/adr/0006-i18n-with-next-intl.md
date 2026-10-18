---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# German-first i18n with next-intl

## Context and Problem Statement

The first audience is German-speaking couples, but English and other languages should be possible later
without touching every component.

## Considered Options

* next-intl with JSON message catalogues, without locale routing for now
* Hardcoded German strings, translated later
* i18next / react-i18next

## Decision Outcome

Chosen option: "next-intl with JSON message catalogues", because it supports server and client components
in the App Router, ICU plurals and date formatting. Without locale routing, URLs stay clean. All UI copy
lives in `messages/de.json`, including the login email and error messages (domain errors are codes that
the UI translates). Adding a language means adding a catalogue and listing the locale in
`src/i18n/config.ts`.

### Consequences

* Good, because `react/jsx-no-literals` in ESLint stops hardcoded strings from creeping into
  components.
* Bad, because a per-user or per-website language choice still has to be added (locale is fixed to `de`
  in v1).
