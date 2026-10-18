---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Themes as data packages

## Context and Problem Statement

Wedding sites live from their visual variety, and the catalogue of themes will grow. Adding a theme should
not require a developer or a code change.

## Considered Options

* Theme folders with a validated JSON manifest, discovered at start-up
* Themes as React components
* Themes stored in the database and edited in an admin UI

## Decision Outcome

Chosen option: "Theme folders with a validated JSON manifest", because a theme is then pure data:
`themes/<id>/theme.json` (localized name and category, palettes, default font pairing) plus assets. The
loader validates it with zod and skips invalid packages. One site component renders every theme through CSS
custom properties. Ornaments are single-colour SVGs used as CSS masks, so one file works with every palette.

### Consequences

* Good, because adding a theme means adding a folder (see `docs/themes.md`).
* Good, because themes cannot run code. Only declared assets are served, with a restrictive CSP.
* Bad, because themes cannot change layout structure; that needs a code change.
* Font pairings are a fixed list in code, because fonts are bundled at build time (see ADR 0005).
