---
status: accepted
date: 2026-10-20
decision-makers: Traureise maintainers
---

# Sections built from typed blocks

## Context and Problem Statement

A website version had eight fixed sections (Unsere Geschichte, Tagesablauf, Anreise, Empfehlungen, Geschenkideen,
Hochzeitsgesellschaft, Galerie, Häufige Fragen), each with its own item fields and its own layout. Couples could not
add a section, put a few words above the wedding party or place the brunch in a section of its own: only "Unsere
Geschichte" held text. A fully free page builder would fix that but break theming, because the site looks designed
only while every piece of content has a known, designed layout. The schedule also lived in two places: events
belonged to the wedding, but each version kept a list of hidden events, and events had a manual order.

## Considered Options

* Keep the fixed sections and add a free text field to each
* A free-form page builder (columns, free positioning, per-block styling)
* Sections as a title plus an ordered list of typed blocks from a small, fixed set

## Decision Outcome

Chosen option: "Sections as a title plus an ordered list of typed blocks".

* There are seven block types, each with fixed fields and its own designed layout: Text, Termin (event), Person
  (with an optional text), Ort (with Art: hotel, parking, arrival, activity, other), Link, Frage & Antwort and Bild.
  Consecutive blocks of one type render as one group (one card grid, one gallery, one event list). Themes keep
  styling block types, never arbitrary combinations.
* `website_sections` rows have an id, a position, a required title, visibility and the block type a template
  section suggests while empty. `section_blocks` hang off a section (cascade) with a position and a `jsonb` `data`
  column validated by a zod discriminated union on `type` (`src/domain/sections.ts`).
* Today's eight sections are the standard template: a new wedding's first website and "Aus Vorlage erstellen"
  (a new website version) start from it, with the translated titles written in. "+ Abschnitt" adds an empty section
  or one template section. Template sections start empty, except Tagesablauf, which shows all events.
* Events stay the wedding's (`wedding_events`) and get their own area, the Ablauf. An event block references
  events and never copies them: `eventId: null` shows the whole Ablauf (including events added later), an id shows
  one event. Deleting an event deletes the single-event blocks that point to it, in every version.
  `websites.hidden_event_ids` and `wedding_events.position` are gone: a version shows an event exactly where an
  event block puts it, and events are always listed chronologically (date, then start time).
* Section anchors and editor routes use the section id (`#s-<id>`, `/hochzeiten/<id>/website/<websiteId>/<sectionId>`),
  so two sections may share a title.

### Consequences

* Good, because every field of the old items has a home in a block, and the couple can arrange sections and
  blocks freely without leaving the designed layouts.
* Good, because an event's time and place exist exactly once; the invitations, the response form and every website
  version read the same row.
* Good, because the account export writes sections with their blocks in order.
* Bad, because a version that should leave some events out has to use single-event blocks instead of "Alle
  Termine".
* Neutral: no data migration; the migration drops the old fixed sections (no instance holds real data yet).
