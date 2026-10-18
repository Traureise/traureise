---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# One household page for all cards

## Context and Problem Statement

v3 gave every household a personal link (`/antwort/<token>`) for its answer. v4 adds a Save the Date, an
invitation and a thank-you card per household, sent months apart. Guests should not have to keep track of
several links, and links already sent must keep working.

## Considered Options

* A new link per card
* One link per household that shows everything sent to it
* One public link per card for everyone, with the household chosen on the page

## Decision Outcome

Chosen option: "One link per household that shows everything sent to it".

* The v3 link is the household's page. It shows the cards sent to that household (by email, WhatsApp or a
  copied link), newest first; older ones stay below. The domain rule `householdPageContent` decides it.
* The response form comes with the invitation. Once an invitation card exists, a household sees the form
  only after its invitation was sent (and answers are refused before that); without an invitation card the
  page is the v3 response page. A website with only the RSVP package therefore keeps the v3 page.
* A card goes to every household by default; the couple can leave households out per card.
* The engagement announcement is not personal and has one link for everyone, `/<slug>/verlobung`.
* The page opens like a letter: an envelope with the household's name; tapping it opens it. The couple can
  switch the envelope off per card; with reduced motion or without JavaScript the card shows directly.

### Consequences

* Good, because there is one link per household for the whole wedding, and nothing already sent breaks.
* Good, because what a household sees follows from what was sent to it, which the couple controls.
* Bad, because a household passing its link on shares every card it got; that is how households already
  share the v3 link, and the spec accepts it.
