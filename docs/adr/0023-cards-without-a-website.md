---
status: accepted
date: 2026-10-19
decision-makers: Traureise maintainers
---

# Cards without a website

## Context and Problem Statement

Couples need things in a fixed order: the engagement announcement, the Save the Date, the website, the
invitation and the thank-you card. Some never want a website, and many send the engagement announcement or
the Save the Date before they think about one. Until now every card belonged to a website, so a couple had
to create a website first. Cards, households, deliveries, packages, retention, the account export and
deletion all hang off `websites.id`.

## Considered Options

* Keep "website first" and explain it in the dashboard
* A new `weddings` table that owns cards, guests and packages, with the website as an optional child
* Keep the `websites` row as the wedding and add a switch for its public website

## Decision Outcome

Chosen option: "Keep the `websites` row as the wedding and add a switch for its public website".

* `websites.site_enabled` (default true, so existing rows stay websites). A row with `false` is a wedding
  with cards only: `/<slug>` and its calendar events are a 404, the website editor redirects to the
  dashboard, and cards don't link to the website. Its slug is generated, and `/<slug>/verlobung` and
  `/<slug>/hochzeit.ics` work as before.
* Creating a card without any wedding asks only for names and an optional date (`CreateCardForNewWedding`).
* "Hochzeitswebsite" on an account with such a wedding preselects it and switches its website on
  (`EnableSite`), with the web address and theme chosen then. It never creates a second wedding by
  accident: that would split guests, cards and packages. "Neue Hochzeit" is still one click away.
* Names, date and place can be changed from the card editor and the dashboard (`UpdateWeddingDetails`),
  so a couple without a website never needs the website editor.
* The dashboard shows a wedding without a website as a card with **Website erstellen**, **Angaben
  ändern**, **Gäste** and **Löschen**. Deleting removes the whole wedding: cards, guest list and photos.

### Consequences

* Good, because every product can be the first one, and nothing about guests, packages, retention, export
  or deletion changes: they still hang off one row.
* Good, because existing data and code paths keep working; the migration is one column with a default.
* Bad, because the table and code still say "website" for what is now the wedding. Renaming it would touch
  every layer for no behaviour change; the docs say "wedding" where it matters.
