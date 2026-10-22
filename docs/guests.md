# Guests and RSVP

Couples keep their guest list in Traureise and send each household a personal link. The link is also
where the household gets its Save the Date, invitation and thank-you card ([cards](cards.md)). Guests answer in one
form: who is coming, to which events, the meal, allergies and intolerances, the couple's own questions,
requests to bring someone else, and a message. The couple sees the answers on the **Gäste** page.

## For couples

The **Gäste** page (`/hochzeiten/<id>/gaeste`) is linked from the wedding's home and from the website editor.
It has three tabs:

- **Übersicht**: pending requests for additional guests come first (**Zur Gästeliste** adds the person to
  that household, **Ablehnen** declines; the household sees the outcome on its link). Then a response bar of
  everyone (kommen, kommen nicht, offen, with open answers hatched), how many households have answered, and
  only the counts there are: per event, per dish, per poll answer, the allergy list. Below is the guest list,
  one row per household: its people, a status filter (offen, geantwortet, abgesagt), **Link kopieren** and
  **WhatsApp** (or, for a chosen card, its send buttons), and a menu with the reminder, marking a card as sent
  by hand, leaving a household out, editing and deleting. Each row opens the household's answers. A **CSV**
  export lists every person with their answers.
- **Einstellungen**, one page of sections (answers, meal choice, notifications, message, polls): the reply-by date (answers can change until the end of that day, then the form is
  read-only), which events of the schedule guests answer for (all by default), the meal choice (dishes,
  optionally only for one event), notifications (off, an email per answer, or a daily summary at 8:00), and
  the WhatsApp text (`{name}` becomes the household's name; the link is added). Polls are single or multiple
  choice, optionally with a free "Andere" answer, and answered per person or once per household.
- **Vorschau**: the form exactly as guests see it, in the website's theme. Nothing is saved.

**Person hinzufügen** next to the list adds one person as their own household in one step (just the name);
**Haushalt hinzufügen** opens the full form.

Each person can have an **email address** (optional, for cards and reminders by email). A household is
still mailed once, at every address of its people. A household also has a **personal line** for the
thank-you card. The unsubscribe link stops mail for the whole household: it clears every person's address,
and the household shows "Keine E-Mails gewünscht" until you enter a new address.

A household is invited to all RSVP events unless you untick some; its form then shows only those events,
and the meal choice only if it is invited to the meal's event.

**Antwort eintragen** (in a household's "⋯" menu, and under "Antworten ansehen") is for households without a
phone or a computer, such as grandparents who answer by phone. The couple fills in the household's own form, at
`/hochzeiten/<id>/gaeste/<household>/antwort`. It is always open: before anything was sent, after the reply-by date
and without a package, because nothing goes out. The answer counts like one through the link and is marked "von
euch eingetragen"; the couple gets no notification of their own entry. Requests to bring someone and the message to
the couple are the household's, so that form leaves them out (a message the household wrote stays). If the household
opens its link later, it sees what was entered and can change it; its answer then counts as its own.

**WhatsApp** opens `https://wa.me/?text=…` with the text and link, in your own WhatsApp. Traureise sends
nothing to WhatsApp or anyone else. **Erinnerung senden** sends a reminder to a household that has not
answered (an email where there is an address and the Einladungen package, otherwise WhatsApp), and the
invitation can send reminders automatically ([Reminders](cards.md#reminders)).

## For guests

Guests need no account and get no cookies. The link `/antwort/<token>` is personal to the household; it
shows and changes only that household. The page sends `Referrer-Policy: no-referrer` and `noindex`, and
loads nothing from other hosts. Answers are rate-limited per link and per address.

## The RSVP package

On instances with billing, preparing everything is free: the guest list, settings, polls, meal choice and
the preview. The **RSVP** tier is what sends: active links, Link kopieren and WhatsApp, and notification
emails. Without it these buttons lead to `/preise`, and a link opened by a guest shows a neutral "not active
yet" page. Without billing (self-hosted) everything is available
([ADR 0016](adr/0016-configure-free-send-paid.md)).

## Retention

Guest data (households, people, answers, requests, email addresses, personal lines, and the cards' sent and
opened status) is deleted automatically at the latest of 12 months after
the wedding and the end of the RSVP package. About 30 days before, the couple gets an email and a notice on
the Gäste page suggesting the CSV export. A refund stops the links at once but keeps the data until that
date. Without a wedding date and without a package nothing is deleted automatically
([ADR 0017](adr/0017-automatic-deletion-of-guest-data.md)). The job runs inside the app every
`GUEST_JOBS_INTERVAL_MINUTES` ([ADR 0018](adr/0018-background-jobs-inside-the-app.md)).

Deleting a household, the website or the account removes its guest data at once; the account export
(`data.json`) contains all of it.

## For operators

- Set `APP_SECRET` to a long random value before couples send links, and never change it afterwards: the
  links are derived from it ([ADR 0015](adr/0015-households-with-hashed-personal-links.md)).
- RSVP emails go to the couple through your SMTP provider and contain guests' names, answers and messages.
- Your privacy policy should say what is stored about guests and when it is deleted
  ([What to write](legal-and-billing.md#what-to-write)).
