---
status: accepted
date: 2026-10-21
decision-makers: Traureise maintainers
---

# Legal pages are links to wherever the operator publishes them

Supersedes [ADR 0010](0010-legal-pages-as-operator-markdown-files.md).

## Context and Problem Statement

Every public instance needs an Impressum (§ 5 DDG) and a privacy policy (Art. 13 DSGVO), and with billing also
terms. ADR 0010 had the operator mount Markdown files that the app rendered at `/impressum`, `/datenschutz` and
`/agb`. The author's own instance has a second public site, the documentation at docs.traureise.de, which needs
the same texts as well. Should the app keep rendering legal texts?

## Considered Options

* Links: `IMPRINT_URL`, `PRIVACY_URL` and `TERMS_URL` name the pages, wherever the operator publishes them
* Keep the Markdown files (ADR 0010), and publish the same texts a second time with the documentation
* Both: a file or a link per page

## Decision Outcome

Chosen option: "Links", because the legal texts belong to the operator, not to the software, and one place for
them is easier to keep right than two.

* The app renders no legal text. The app footer and the discreet footer of every wedding website and guest page
  link each page that is set; unset, there is no link. `/impressum`, `/datenschutz` and `/agb` do not exist.
* Only `http(s)` links are accepted; the app logs a warning at startup when `IMPRINT_URL` or `PRIVACY_URL` is
  missing.
* The author's instance publishes its pages with the documentation (docs.traureise.de). The texts stay in the
  public deployment repository (`Traureise/stacks`); the documentation build copies them in only when it runs for
  `Traureise/traureise`, so a fork's documentation never carries the author's Impressum.
* A self-hoster on a LAN sets nothing and sees no links; a public self-hoster links pages on their own site.

"Both" was dropped as two code paths for one need. The Markdown renderer and its dependency are gone.

### Consequences

* Good, because the app has no legal content, no renderer and no file mount, and the texts change without touching
  the app or its deployment.
* Good, because one set of pages covers the instance and its documentation.
* Bad, because the legal pages are on another site than the app. That is allowed (they must be easy to recognise
  and reachable from every page, which the footer links are), but an operator has to publish them somewhere.

### Confirmation

Unit tests for the settings. E2E checks that the default instance has no legal links or pages and that the
billing instance links a fictitious operator's pages from the app footer and from the wedding websites.
