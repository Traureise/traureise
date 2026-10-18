---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# "Opened" status without tracking

## Context and Problem Statement

Couples want to see which households opened their Save the Date or invitation ("23 von 31 Haushalten
geöffnet", "Einladung nicht geöffnet"). Tracking guests is an anti-goal: no pixels, no read receipts, no
link wrapping, no third-party requests.

## Considered Options

* A tracking pixel or read receipt in the email
* Recording "opened" when the server renders the household's page
* Recording "opened" when the household's page actually shows the card, reported by the page itself

## Decision Outcome

Chosen option: "Recording it when the page shows the card".

* The household's page posts the kinds it showed to `/api/antwort/<token>/geoeffnet` once the envelope is
  opened (or at once when the envelope is off or reduced motion is set). The server records the first time
  only, and only for cards that page shows.
* Rendering the page records nothing: WhatsApp link previews and email security scanners fetch the page
  before any guest does and would mark every card opened at once.
* The couple's preview never counts; the couple opening a household's real link does, which is accepted.
* Without JavaScript nothing is recorded; such a visit simply does not count.

### Consequences

* Good, because it is first-party, on the household's own page, and needs nothing in emails.
* Good, because bots do not inflate the counts.
* Bad, because "opened" is a lower bound: visits without JavaScript, or a household reading over another
  household's shoulder, are not counted.
