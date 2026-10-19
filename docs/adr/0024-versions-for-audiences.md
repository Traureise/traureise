---
status: accepted
date: 2026-10-19
decision-makers: Traureise maintainers
---

# Versions of cards and websites for audiences

## Context and Problem Statement

Couples send different cards to different audiences (family and friends) and sometimes want two websites, for
example one with the family dinner and one without. Each household must get exactly one version of each item,
the one the couple chose, and never two versions of the same card. Sent and opened status, reminders, the email
queue, retention and the account export must keep working.

## Considered Options

* Separate weddings per audience
* Per-household content inside one card (texts that depend on the household)
* Several versions per item, and a choice per household which one it gets

## Decision Outcome

Chosen option: "Several versions per item, and a choice per household".

* `cards` and `websites` have several rows per wedding (and kind), each with a `label` and a `position`; the
  lowest position is the first version, which every household gets by default. A new version is a copy of an
  existing one (by default the first). Website versions have their own slug and start as drafts; card versions
  have a fixed slug for their link (only used by the engagement announcement, `/<slug>/verlobung/<version>`).
* `household_versions` (household, item, card or website) records a household's choice; no row means the first
  version. It cascades with the household and with the version, so deleting a version moves its households to
  the first remaining one. The last version of an item cannot be deleted.
* "Sent" counts per household and kind: `card_deliveries` is keyed by (household, kind), so "An alle senden" and
  the reminder job skip a household that got any version, and the status moves with a re-assignment. The email
  job resolves the household's version when it sends. "Opened" is kept per version (`card_opens`).
* A household's cards link to its assigned website version once that version is online; its page takes that
  version's design, published or not (the page is private to the household).
* Every card kind is assigned per household, the engagement announcement included (owner, after manual testing:
  it is part of the guest-list flow). Each engagement version also keeps its own public link and share dialog, for
  people outside the guest list; sharing that link also counts its step as done.
* Extra versions are paid, through `canUse` only: Save the Date and invitation need Einladungen, engagement
  announcement and thank-you card need Komplett, a website any paid package. When a package ends, versions
  already added keep working; only an extra website version goes offline (one rule, `websiteOnline`, used by the
  public site, card links, the timeline and the editor). With billing off, everything is unlimited.
* The guest list shows a version choice only for items with more than one version.
* Cards the couple sent outside the app (WhatsApp from the phone, in person, by post) are marked by hand
  ("Als gesendet markieren", per household or for all; `shared_via = 'manual'`). That counts as sent, so the
  household's page shows the card; only a hand mark can be undone, never a real send.

### Consequences

* Good, because a household can never get two versions of one card, and re-assigning never sends anything again.
* Good, because all ownership checks go through the wedding: a version id from another wedding, or of another
  item, is a 404.
* Bad, because opened status is per version: after a re-assignment the household shows "sent" until it opens the
  new version. That is what the couple wants to know.
