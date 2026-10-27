# Weddings, the timeline and versions

Everything a couple makes in Traureise belongs to a **wedding** (Hochzeit): the cards, the website, the guest
list and the packages. One account can hold several weddings, for example for wedding planners or for helping a
friend. A wedding can also be shared with other accounts, see [Sharing a wedding](#sharing-a-wedding).

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
place, and then the five items as a timeline. Left of the line, each step says when it is due, in dates once the
wedding has one: "Jetzt" with the last day, "Ab …" before it opens, "Jetzt nachholen" in red once it closed and the
step is not done. Save the Date 12 to 6 months before, the website by 4 months before (the invitation links it; a
Save the Date sent earlier shows the link once the website is online), the invitation 4 to 3 months before, the
thank-you card up to 2 months after. On the line, finished steps have a tick, the next step is lifted out with
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

## Sharing a wedding

A wedding belongs to its **members**, not to one account. Each member has one role for the whole wedding:

- **Editor**: can change everything in the wedding (Hochzeit, Ablauf, guest list, websites, cards, images).
- **Admin**: everything an editor can, plus inviting people, changing roles, removing members, buying packages
  and deleting the wedding.

All admins are equal; whoever created the wedding is simply its first admin. A wedding always has at least one
admin: the last one cannot leave, be demoted or be removed. People who are not members cannot tell that the wedding
exists.

Members are managed in the **Personen** section of the Hochzeit tab (editors see it read-only):

- **Person einladen**: an admin enters an email address and a role. The person gets an email with a link that is
  valid for 14 days, once, and only for that address. Following it logs them in (the account is created if needed)
  and adds the wedding to their dashboard. Inviting the same address again replaces the pending invitation; open
  invitations are listed and can be withdrawn (**Zurückziehen**).
- Admins can change roles and remove members (**Entfernen**). Any member can leave (**Hochzeit verlassen**) unless
  they are the last admin.
- **Kontaktperson für Gäste**: guests' replies to cards and reminders go to this member's address (it starts as
  the wedding's creator). If that person leaves, an admin takes over.

The wedding's own mail goes to **all admins**: RSVP notifications and the daily summary, and the warning before
guest data is deleted. Purchases are visible to admins only, with who bought each package; the invoice stays with
the buyer.

Deleting an account removes the person's memberships, not the wedding, and the wedding's images stay. A wedding the
person was the only member of is deleted with the account. Someone who is the last admin of a wedding with other
members cannot delete their account until another member is made admin; the deletion page lists those weddings.
The account export includes the weddings the person is an admin of, and lists their other memberships.

See [ADR 0029](adr/0029-weddings-have-members.md).

## Addresses

The wedding has an address for the links that are not a website (`/<adresse>/verlobung`, `/<adresse>/hochzeit.ics`).
Its first website version starts with the same address; other versions get their own (`<adresse>-freunde`). All
addresses share one namespace: a website version may use its own wedding's address, never another wedding's.
`/<adresse>` shows the website version with that address if it is online; an address that only a wedding has shows
that wedding's first online version. Changing one address never changes another.

See [ADR 0023](adr/0023-everything-belongs-to-the-wedding.md) and [ADR 0024](adr/0024-versions-for-audiences.md).
