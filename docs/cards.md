# Save the Dates, invitations and cards

Each wedding can have four cards: an **engagement announcement** (Verlobungsanzeige), a **Save the
Date**, an **invitation** (Einladung) and a **thank-you card** (Dankeskarte), one of each. They open like a
letter: a sealed envelope addressed to the household, and the card slides out. Couples send them by link,
WhatsApp or email, and can export every card as PDF and PNG to print at home.

## For couples

**Creating.** The dashboard's **Erstellen** menu lists everything in the order you need it:
Verlobungsanzeige, Save the Date, Hochzeitswebsite, Einladung, Dankeskarte. Any of them can come first, and
you don't need a website for cards. With no wedding yet, a card asks only for your names and an optional
date; with several weddings you pick one. The card editor opens. **Angaben ändern** next to the names changes
names, date and place for all cards (and the website, once there is one).

A wedding without a website shows on the **Hochzeitswebsites** tab with **Website erstellen**, **Angaben
ändern**, **Gäste** and **Löschen**. **Website erstellen** (there or in the menu) creates the website for that
wedding, keeping its guest list, cards and packages; until then nothing is public at its address, and cards
don't link to a website. See [ADR 0023](adr/0023-cards-without-a-website.md).

The tabs **Verlobung**, **Save the Dates**, **Einladungen** and **Dankeskarten** list the cards with a preview, how many households opened them ("23 von 31 Haushalten geöffnet"), and **Bearbeiten**,
**Ansehen**, **Teilen**, **Exportieren** and **Löschen**.

**Designing.** The editor (`/websites/<id>/karten/<art>`) shows the card on the right exactly as guests see
it, updated as you type. Each card picks its own theme, colours, fonts and layout; by default it takes the
website's. Then the photo and texts:

| Card | Content |
|---|---|
| Save the Date | photo, names, date, place, a short text ("Einladung folgt"). Guests get **Zum Kalender hinzufügen** (`.ics`, all-day) and **Zur Website**. |
| Einladung | "Wir heiraten" (editable), names, date, time and venue of a schedule event (each overridable), the reply-by date, a text. The response form follows below the card. |
| Dankeskarte | photo, a text for everyone, and an optional **personal line per household**, which you enter in the guest list. |
| Verlobungsanzeige | photo, names, a text, optionally the link to your website (once you have one). |

**Mit Umschlag öffnen** switches the envelope on or off per card. **Vorschau mit Umschlag** shows the whole
page as a household sees it; the preview never counts as opened.

## One link per household

Each household has one personal link, the one from [Guests and RSVP](guests.md). It is the household's
page and shows what you have sent it, newest first: first the Save the Date; once the invitation is sent,
the invitation with the response form, with the Save the Date below; after the wedding the thank-you card
on top. Links already sent keep working. A website with only the RSVP package keeps the plain response
page.

Until you send a household a card, its page is the response page from v3. A page that shows only a Save
the Date has no response form; the invitation brings it.

The engagement announcement is not personal: it has one link for everyone, `/<website>/verlobung`.

## Sending

On the **Gäste** page, **Versand** picks the card. Every household then shows how it was sent and whether it
was opened, with these buttons:

- **WhatsApp** opens WhatsApp with your text and the household's link (a `wa.me` link in your own app).
- **Link kopieren** copies the link.
- **E-Mail senden** emails the card to the household's address, if it has one.
- **Auslassen** leaves a household out of this card (by default every household gets every card).

**Per E-Mail an alle senden** sends the card to every household with an address that has not had it yet,
after a confirmation with the count. Households without an address keep link and WhatsApp; the list
shows each household's channel. Filters show for example "Einladung nicht geöffnet".

The text for WhatsApp and email is per card (`{name}` becomes the household's name).

## Reminders

- **Automatic:** on the invitation, set days before the reply-by date (default 14 and 3). On those days
  every household that got the invitation, has an email address and has not answered gets a reminder
  email. Each reminder goes out once; if several are due at once, only the latest is sent; none goes out
  for an invitation sent after that day. Reminders, automatic or by button, stop when the household answers or the reply-by date has
  passed.
- **Erinnerung senden** per open household or **Erinnerung an alle offenen**: an email where there is an
  address, otherwise a WhatsApp link with the reminder text.

## Opened

A card counts as opened the first time the household's own page shows it, that is, when the envelope is
opened (or straight away without the envelope). The page reports this to Traureise itself. No tracking
pixels, no read receipts, no wrapped links; emails cannot tell whether they were read. Link previews and
email scanners do not count, because they do not open the envelope. A couple opening a household's real
link does count. See [ADR 0022](adr/0022-opened-status-without-tracking.md).

## Export

**Exportieren** downloads the card as PDF in **A6** or **A5** portrait (for printing at home) or as a
**PNG** 1748 px wide (for messengers). The instance renders them itself; no external service is involved
([ADR 0020](adr/0020-card-rendering-and-export.md)).

## Packages

Designing and the preview are free. On instances with billing:

| Package | Unlocks |
|---|---|
| Einladungen | Save the Date and invitation (links, export), email sending, email reminders |
| Komplett | also the thank-you card and the engagement announcement |

The WhatsApp reminder button belongs to RSVP. Locked buttons lead to `/preise`. Without billing everything
is available.

## Data and deletion

Guest email addresses, personal lines, and the sent and opened status are guest data: they are in the
account export and are deleted with the guest list (12 months after the wedding or at the end of the
package, see [Guests and RSVP](guests.md#retention)), with the website and with the account. The cards'
designs and texts stay with the website until it is deleted.

## For operators

Card emails go through your SMTP server on the couple's behalf; read [Email](email.md#emails-to-guests).
Your privacy policy and terms should cover guest email addresses, emails sent on the couple's behalf, the
opened status and unsubscribing ([What to write](legal-and-billing.md#what-to-write)).
