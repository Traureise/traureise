---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Magic-link login with database-backed sessions

## Context and Problem Statement

Couples log in rarely and should not have to manage another password. The SaaS operator must not store
password hashes or depend on a US identity provider. How do users authenticate?

## Considered Options

* Magic links by email, with sessions in our database
* Email and password
* An external identity provider (OAuth or a hosted service)

## Decision Outcome

Chosen option: "Magic links by email, with sessions in our database", because there are no passwords to
leak or reset, no third party sees who logs in, and the only infrastructure needed is SMTP, which
self-hosters already configure.

* Tokens: 32 random bytes. Only their SHA-256 hash is stored. They are valid for 15 minutes, and
  "single use" is enforced atomically (`UPDATE … WHERE used_at IS NULL`).
* Rate limits: 5 requests per email and 20 per client address in 15 minutes, counted in PostgreSQL.
  The client address is the last `X-Forwarded-For` entry, which the reverse proxy appends.
* Unknown emails get an account on first login. The first name is asked for once.
* Sessions: a random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` when `APP_URL` is
  https), stored hashed in a `sessions` table with a 30-day expiry. Logout deletes the row.
* Authorization: owner-only use cases treat other users' websites as not found (404), so whether a
  website exists is not revealed.

### Consequences

* Good, because sessions can be revoked server-side.
* Bad, because login depends on email delivery. Mail scanners that open links can use up tokens, so users
  may have to request a new link.
