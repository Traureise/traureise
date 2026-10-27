# Email (SMTP)

Traureise sends three kinds of email over plain SMTP, so any mail provider works: the login link,
notifications to a wedding's admins about their guests' answers, and cards and reminders to guests on the couple's
behalf.

## The bundled Mailpit

By default, `SMTP_HOST=mailpit` points at the Mailpit container, which catches every email instead of
delivering it. Its inbox is at <http://localhost:8025>. That is right for trying Traureise out and for
the automated tests, but nobody else will ever receive a login link.

!!! warning "Mailpit shows every login link"
    Anyone who can open the Mailpit inbox can log in as any user. Keep it bound to `127.0.0.1`
    (the default) and never expose it publicly.

## Using a real mail provider

1. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` for your
   provider. For GDPR, prefer an EU provider and sign a data processing agreement (AVV) with it.
2. Remove the `mailpit` service, and the `depends_on` entry that points to it, from
   `docker-compose.yml`, or keep it if you want a catch-all inbox for testing.
3. Configure SPF, DKIM and DMARC for the sender domain, so login links don't end up in spam.

```dotenv
SMTP_HOST=smtp.example.de
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@example.de
SMTP_PASSWORD=…
MAIL_FROM=Traureise <no-reply@example.de>
```

## Emails to guests

Cards and reminders go to guests who have an email address in the guest list
([Save the Dates, invitations and cards](cards.md)):

- **Sender:** the address of `MAIL_FROM` with the couple's names as display name, for example
  `"Anna & Ben über Traureise" <no-reply@example.de>`. `Reply-To` is the wedding's contact person (a member, chosen on the Hochzeit tab), so
  answers go to them, not to you.
- **Content:** the couple's text, the card as an attached image (no remote images, so nothing tracks
  opening), one button to the household's page, and a footer saying who sent it and why.
- **Unsubscribe:** every email has a link and a `List-Unsubscribe` header with one-click
  `List-Unsubscribe-Post` (RFC 8058). One click, without login, clears the household's address, so it gets no
  more emails for this wedding. Only a POST unsubscribes; link scanners that follow the link see a page
  with a button.
- **Background sending:** emails are queued and sent by the background job, at most `MAIL_BATCH_SIZE` per
  pass with `MAIL_SEND_INTERVAL_MS` between two. Every email is claimed in the database first, so it never
  goes out twice, also with several app instances; one interrupted mid-send is marked failed, never retried
  on its own ([ADR 0021](adr/0021-sending-email-on-the-couples-behalf.md)).

Sending wedding mail is mass email to people who did not sign up with you: use a provider that allows it,
set up SPF, DKIM and DMARC for the `MAIL_FROM` domain, and keep the default rate unless your provider allows
more.

## Limits

Login links are valid for 15 minutes and work once. Login requests are rate-limited to 5 per email
address and 20 per client address in 15 minutes (see [Reverse proxy](reverse-proxy.md) for how the
client address is determined).
