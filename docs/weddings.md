# Weddings, the timeline and versions

Everything a couple makes in Traureise belongs to a **wedding** (Hochzeit): the cards, the website, the guest
list and the packages. One account can hold several weddings, for example for wedding planners or for helping a
friend.

## Creating a wedding

After the first login (and the first name) Traureise asks for the wedding: the couple's names, **Habt ihr schon
ein Datum?**, and the date on yes. Nothing else. From that it makes one first version of every item, filled in with
the names and the date:

1. Verlobungsanzeige
2. Save the Date
3. Hochzeitswebsite
4. Einladung
5. Dankeskarte

The website is a **draft**: it is not online until you publish it in the website editor (**Veröffentlichen**, and
**Offline nehmen** to take it down again). A draft's address is a 404 for everyone else; you see it in the
editor's preview.

The **Hochzeit** tab (`/hochzeiten/<id>/hochzeit`) holds names, date, place, time zone and the wedding's address for
everything at once, and deleting the wedding. The place can be found on an OpenStreetMap map, after the couple agrees to
load it ([ADR 0026](adr/0026-openstreetmap-location-picker-after-consent.md)); its spot is kept, and the maps in the
Ablauf start there. **Angaben ändern** and **Datum eintragen** (on the timeline, in every card editor, on the website's
Startseite and on the guest list) lead to this tab and, from an editor, back after saving. Cards follow, except where
you rewrote the text. Without a date, the Save the Date and the invitation show "Datum folgt"; you can design them,
but sending and exporting wait until the wedding has a date.

## Four tabs

Every wedding has four tabs under its name: **Vorbereitung** (the timeline below), **Hochzeit** (the details above),
**Gästeliste** ([Guests and RSVP](guests.md)) and **Ablauf** (the events). A tab stays current on its own subpages,
such as the guest list's settings. Card and website editors are full pages of their own, with a breadcrumb back to
the wedding and to the list of weddings.

## Vorbereitung: a timeline

`/dashboard` opens the wedding you used last; `/hochzeiten` lists all of them, and **Neue Hochzeit** (in the
switcher at the top of a wedding, or on the list) starts another one.

A wedding's home (`/hochzeiten/<id>`) greets you with your names, shows how many days are left, the date and the
place, and then the five items as a timeline: finished steps have a tick, the next step is lifted out with
**Weitermachen**, later ones are quieter. Each step shows a small preview, when couples usually do it, its status
("28 von 31 Haushalten geöffnet", "Entwurf · noch nicht veröffentlicht") and its versions. **Versenden** opens the
guest list for that item; for the published website it opens the guest list with each household's personal link.

What counts as finished: a card once every household it is meant for got it (the engagement announcement also
once you shared its public link), the website once a version is online. **Speichern und schließen** (in the arrow
next to **Speichern** in the card editor) saves and goes back to this page.

## Versions for different audiences

Each item can have several **versions**, for example "Familie" and "Freunde". **+ Version** asks for a name and
which version to copy (the first by default). The first version of every item is called "Standard" until you rename
it; versions can be renamed and deleted, except the last one of an item. In an editor, the version menu (the button
named after the version) switches between versions and holds these actions.

- **Who gets what** is chosen on the guest list: with more than one version of an item, each household gets a
  choice. By default every household gets the first version.
- A household's page shows the versions assigned to it, and its Save the Date links its assigned website version
  once that one is online. Its page also takes that website's design.
- **Sent counts per household and item.** A household that got any version of a card has it; "An alle senden"
  and the reminders skip it, so nobody gets two versions. Re-assigning sends nothing again: the household's page
  then shows the new version. Deleting a version moves its households to the first remaining version; they keep
  their status.
- The engagement announcement goes through the guest list like the other cards. Each version also has a public
  link for everyone else (`/<adresse>/verlobung`, further versions at `/<adresse>/verlobung/<version>`), with its own
  share dialog.
- **Website versions** have their own address and start as drafts. The schedule belongs to the wedding: every
  version shows all events unless you switch some off for that version ("Auf dieser Website zeigen").

Extra versions are paid when billing is on (see [Legal pages, account rights and billing](legal-and-billing.md)):
an extra Save the Date or website needs **RSVP**, an extra invitation **Einladungen**, an extra engagement
announcement or thank-you card **Komplett**. Versions you added stay when a package ends; an extra website
version then goes offline. Self-hosted without billing, everything is unlimited.

## Addresses

The wedding has an address for the links that are not a website (`/<adresse>/verlobung`, `/<adresse>/hochzeit.ics`).
Its first website version starts with the same address; other versions get their own (`<adresse>-freunde`). All
addresses share one namespace: a website version may use its own wedding's address, never another wedding's.
`/<adresse>` shows the website version with that address if it is online; an address that only a wedding has shows
that wedding's first online version. Changing one address never changes another.

See [ADR 0023](adr/0023-everything-belongs-to-the-wedding.md) and [ADR 0024](adr/0024-versions-for-audiences.md).
