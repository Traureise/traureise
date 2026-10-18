# Email (SMTP)

Traureise only sends one kind of email: the login link. It sends it over plain SMTP, so any mail
provider works.

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

## Limits

Login links are valid for 15 minutes and work once. Login requests are rate-limited to 5 per email
address and 20 per client address in 15 minutes (see [Reverse proxy](reverse-proxy.md) for how the
client address is determined).
