---
status: accepted
date: 2026-10-20
decision-makers: Traureise maintainers
---

# OpenStreetMap location picker, loaded after consent

## Context and Problem Statement

Couples type an event's venue and address by hand. Finding the place on a map and filling both fields from a
search would be quicker and more precise, and the website's "Karte ansehen" link could point at the exact spot.
A map needs tiles and a search service. Loading either in the browser sends the user's IP address to whoever
serves it, which [ADR 0005](0005-gdpr-no-runtime-third-party-requests.md) rules out by default.

## Considered Options

* Keep typing by hand (no map)
* Proxy tiles and search through the instance, so the browser only talks to Traureise
* Load OpenStreetMap tiles and Nominatim search in the browser, only after the couple agrees

## Decision Outcome

Chosen option: "Load OpenStreetMap in the browser, only after the couple agrees". The owner chose it:
OpenStreetMap is open and free. What matters for the GDPR is the IP address, and that becomes a choice the
couple makes knowingly.

* The picker is in the event form of the Ablauf, which only the couple sees. Guests' pages load nothing from
  OpenStreetMap; their "Karte ansehen" stays a plain link.
* Until the couple clicks "Karte laden", the picker is a notice that names the OpenStreetMap Foundation and
  the IP address. "Immer laden" remembers the choice in that browser (`localStorage`, no cookie, nothing sent).
* Leaflet comes from npm and is served by the instance; only tiles (`tile.openstreetmap.org`) and search
  (`nominatim.openstreetmap.org`) come from OpenStreetMap. Following their usage policies, search runs on
  Enter or the button (at most one request a second, no search-as-you-type) and the map shows the required
  attribution.
* A result fills the venue and address fields, which stay editable. The event keeps its coordinates
  (`latitude`, `longitude`, both or neither), and "Karte ansehen" opens that spot.

### Consequences

* Good, because nobody's IP address leaves the instance without a click that says where it goes.
* Good, because the fields still work without the map, for couples who decline.
* Bad, because a proxy would have needed no consent at all; it was not chosen because tile usage through a
  proxy needs caching and an agreement with the tile provider, which a self-hoster should not have to arrange.
* The E2E fixture still fails every test that contacts another host; the location test opts into the two
  OpenStreetMap hosts and answers their requests itself.
