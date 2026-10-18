---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# No cookie banner

## Context and Problem Statement

§ 25 TDDDG requires consent for storing information on a user's device unless it is strictly necessary
for a service the user asked for. Does Traureise need a consent banner?

## Considered Options

* Only technically necessary cookies, no banner
* A consent banner for future optional cookies

## Decision Outcome

Chosen option: "Only technically necessary cookies, no banner", because Traureise sets nothing that
needs consent:

* `traureise_session`: keeps a logged-in user logged in (httpOnly, SameSite=Lax).
* `traureise_locale`: optional, remembers an explicit language choice.
* Guests of wedding websites get no cookies. There is no analytics, tracking or third-party content
  (see ADR 0005).

The privacy policy should list both cookies. A banner would add friction and suggest tracking that does not
exist.

### Consequences

* Good, because users and guests see the app straight away.
* Bad, because any future cookie or browser storage that is not strictly necessary needs this decision
  revisited first, together with a consent mechanism.
