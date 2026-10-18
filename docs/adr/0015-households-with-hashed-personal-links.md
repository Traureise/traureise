---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Households with personal links derived from a secret and stored as a hash

## Context and Problem Statement

Guests answer without an account. A couple invites families and couples rather than single people, and
one person usually answers for everyone at the same address. Each household needs a link that nobody can
guess, that only shows and changes that household, and that the couple can copy again at any time (for a
reminder on WhatsApp weeks later). A database dump alone must not hand out working links.

## Considered Options

* A random token per household, stored in clear
* A random token per household, stored only as a hash (like magic links), shown once
* A token derived from the household id with a server secret (HMAC), stored only as a hash

## Decision Outcome

Chosen option: "HMAC token, stored as a hash".

* The guest list is made of **households** (name, invited events, message, household poll answers,
  `responded_at`) with **guests** (name, child, attendance, events, meal, allergies, person poll answers)
  and **guest requests** (people a household asks to bring; pending, added or declined). All of it hangs
  off the website with `ON DELETE CASCADE`.
* The link is `/antwort/<token>` with `token = base64url(HMAC-SHA256(APP_SECRET, "household:" + id))`
  (43 characters, 256 bits). The database stores only `sha256(token)` and looks households up by it.
  The couple's page recomputes the token, so "Link kopieren" works any time.
* The guest form takes the household only from the token. Person, event, meal and poll ids in an answer
  are checked against that household and website; anything else is rejected.
* Submissions are rate-limited per IP and per link. The page sends `Referrer-Policy: no-referrer` and
  `X-Robots-Tag: noindex`, sets no cookies and loads nothing from third parties.
* `APP_SECRET` is new. Without it, or with the `.env.example` placeholder, the app logs a warning and
  falls back to a built-in value, so an upgraded instance keeps working; operators must set their own.

### Consequences

* Good, because a stolen database contains no usable links and the couple never has to "regenerate" one.
* Good, because the same derivation needs no extra column and no extra lookup.
* Bad, because changing `APP_SECRET` invalidates every link already sent. A single leaked link is
  replaced by deleting and re-adding the household (a per-household link version can be added later).
