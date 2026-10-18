---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Documentation site with Material for MkDocs on GitHub Pages

## Context and Problem Statement

Self-hosters need more than a README: configuration, email, storage, HTTPS, backups, themes and the
design decisions. Where should that documentation live, and how is it published without contradicting
the project's privacy promise?

## Considered Options

* Material for MkDocs, built in CI and published to GitHub Pages at docs.traureise.de
* A longer README plus Markdown files browsed on GitHub
* A docs section inside the Next.js app

## Decision Outcome

Chosen option: "Material for MkDocs on GitHub Pages", because the Markdown already in `docs/` (themes
guide, ADRs) becomes a searchable site with no extra runtime to operate, it follows the same setup as
the author's other projects, and the docs stay versioned next to the code.

* `mkdocs build --strict` runs in CI (`.github/workflows/pages.yml`), so broken links fail the build.
* Material's `privacy` plugin downloads fonts and the pinned Mermaid script at build time. Readers'
  browsers only talk to docs.traureise.de, in line with [ADR 0005](0005-gdpr-no-runtime-third-party-requests.md).
* `docs/overrides/partials/source.html` keeps the repository link but stops Material from fetching
  star and fork counts from api.github.com.
* Diagrams are Mermaid blocks in the Markdown, rendered in the browser and styled through
  `docs/stylesheets/extra.css` and `docs/javascripts/mermaid.js`.
* `docs/superpowers/` (local planning notes) is excluded from the build.

### Consequences

* Good, because the docs are browsable, searchable and match light and dark mode.
* Bad, because GitHub Pages requires the repository to be public on the free plan.
* Bad, because the Mermaid styling wrapper depends on Material reusing an already loaded `mermaid`;
  check diagrams in both themes after upgrading Material or Mermaid.
