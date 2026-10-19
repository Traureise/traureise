---
status: accepted
date: 2026-10-19
decision-makers: Traureise maintainers
---

# Everything belongs to the wedding

## Context and Problem Statement

Couples think in terms of their wedding, and the items they need follow a fixed order through the months:
the engagement announcement, the Save the Date, the wedding website, the invitation and the thank-you card.
Until now the website was the root object: cards, households, deliveries, packages, retention, the account
export and deletion all hung off `websites.id`. A couple who started with an engagement announcement needed a
website first, then a hidden "site off" switch, and names and date were asked for in four dialogs. Couples also
want different versions of an item for different audiences (family and friends), and some accounts hold
several weddings (planners, helping a friend).

## Considered Options

* Keep the `websites` row as the wedding, with a switch for its public website (the previous version of this ADR)
* A new `weddings` table that owns everything, with website versions and card versions under it
* An account-level guest list shared by several weddings

## Decision Outcome

Chosen option: "A new `weddings` table that owns everything".

* `weddings`: owner, names, date (null while not planned), place, time zone, last use, and a `slug` for the
  links that are not a website (`/<slug>/verlobung`, `/<slug>/hochzeit.ics`).
* Under the wedding, all with `ON DELETE CASCADE`: website versions (`websites`), card versions (`cards`), the
  schedule (`wedding_events`), households with people, answers and requests, RSVP settings and polls,
  entitlements (one package covers every version) and uploads (versions and cards share photos).
* Creating a wedding asks only for the names and, if planned, the date ("Habt ihr schon ein Datum?"). It
  generates one first version of every card and the website, filled in from the wedding. The website is a
  draft: nothing is public until the couple publishes it.
* Names, date, place and time zone are edited in one place (the details dialog, one component used everywhere);
  cards follow unless the couple rewrote the text.
* The home of a wedding (`/hochzeiten/<id>`) is a timeline of the five items with their status and versions.
  `/dashboard` opens the wedding used last, recorded by the home page itself so link prefetches do not count;
  `/hochzeiten` lists all weddings and `/hochzeiten/neu` is the form. Every couple page has a breadcrumb back to
  the wedding and the list, checked by an E2E walk over all links.
* Slugs: weddings and website versions share one namespace with the reserved words. A wedding's slug may equal
  one of its own versions' slugs (the first version starts with it), never another wedding's. `/<slug>` shows the
  version with that slug if it is online, else, for a slug that is only a wedding's, its first online version.
* Without a date, the Save the Date and the invitation say "Datum folgt"; sending and exporting them wait for a
  date. The engagement announcement has no website link and no date.
* No data migration: no instance holds real data yet, so migration 0005 drops the website-rooted tables and
  0006 recreates them around weddings.

### Consequences

* Good, because every item can be the first one, nothing is asked twice, and a couple can never end up with two
  guest lists or two packages for one wedding by accident.
* Good, because the account export, wedding deletion, account deletion and retention keep working through the
  same cascades, now from `weddings.id`.
* Bad, because every layer changed (routes moved to `/hochzeiten/<id>/…`); acceptable before any instance holds
  real data, and it would only get more expensive later.
* See ADR 0024 for versions and who gets which.
