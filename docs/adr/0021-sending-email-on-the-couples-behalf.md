---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Sending email on the couple's behalf

## Context and Problem Statement

Couples can send cards and reminders to households with an email address, one by one or to all at once.
The emails go through the instance's SMTP server. They must not look like spam, must say who sent them and
why, must be easy to stop, must not track anyone, must survive a request timeout and must never go out twice,
also with several app instances.

## Considered Options

* Sending synchronously in the request
* A job queue library (for example pg-boss)
* Queue rows in the database, sent by the existing background job (ADR 0018), claimed per household and card

## Decision Outcome

Chosen option: "Queue rows sent by the background job".

* **Sender:** `"<couple> über Traureise" <address of MAIL_FROM>`; the display name is passed to nodemailer as
  a name, never concatenated into a header. `Reply-To` is the couple's account address.
* **Content:** the couple's text, the card as an inline image attachment (`cid:`), one button to the
  household's page, and a footer saying who sent it, why, and how to stop. No remote images, no tracking
  pixels, no wrapped links.
* **Unsubscribe:** a link and `List-Unsubscribe` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  (RFC 8058). The token is the household id with an HMAC signature, so it works without login and without a
  stored token. Only a POST unsubscribes (link scanners follow GETs); it clears the household's address.
* **Queue:** sending marks `card_deliveries` rows as queued. `RunMailJobs` claims each row with a
  conditional update before sending, sends, and records success or the error. A claim older than 15 minutes
  that never finished (the instance stopped) becomes a failure, never a retry: at most once, and the couple
  sees it and can send again. The action starts the job right after the response (`after()`), and the
  regular job picks up anything left.
* **Rate limit:** `MAIL_BATCH_SIZE` per pass and `MAIL_SEND_INTERVAL_MS` between two emails.
* **Reminders:** automatic reminders at the days the couple chooses before the reply-by date, only to open
  households with an address that got the invitation, claimed by a compare-and-set on the last reminder
  offset, so each goes out once and only the latest of several due ones.

### Consequences

* Good, because a large send survives timeouts and restarts and is never sent twice.
* Good, because nothing new to deploy; the queue is visible as status in the guest list.
* Bad, because an email interrupted mid-send is not retried automatically (the couple retries), which is the
  price of never sending twice.
* Bad, because deliverability depends on the operator's SMTP provider and DNS (SPF, DKIM, DMARC).
