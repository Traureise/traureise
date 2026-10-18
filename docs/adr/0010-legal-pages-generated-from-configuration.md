---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Legal pages generated from configuration

## Context and Problem Statement

Every public instance needs an Impressum (§ 5 DDG) and a privacy policy (Art. 13 DSGVO). Each operator
has different details, and the privacy policy must match what the instance actually does (which mail
server, which storage, whether payments happen). Where do these texts come from?

## Considered Options

* Generated from configuration: operator details from `OPERATOR_*`, processors from `PRIVACY_*`, the
  rest from the instance's own settings
* Operators write their own pages (Markdown files in a volume)
* Fixed texts in the code for the author's instance

## Decision Outcome

Chosen option: "Generated from configuration", because it is correct by default for self-hosters and
cannot drift from what the software does.

* `domain/operator.ts` turns the raw settings into operator details; name, address and email are
  required. Without them the instance still runs, logs a warning at startup, and both pages say they
  are not configured.
* `domain/privacy.ts` builds the policy as a list of sections from facts about the instance: hosting,
  database, SMTP, storage driver (local or S3 with its provider), the payment provider only when billing
  is on, cookies, login and rate-limit data. Retention periods come from the same constants the use
  cases use, so the policy changes when the behaviour does.
* All copy is in `messages/de.json`. Both pages are linked from the app footer and from a discreet
  footer on every wedding website.

### Consequences

* Good, because a fresh instance never shows someone else's legal details.
* Bad, because operators who need different wording must change the message catalogue. The texts are
  drafts and the README tells operators to have them reviewed.

### Confirmation

Unit tests for both domain functions. E2E checks the unconfigured pages on the default instance and the
populated pages (with a fictitious operator) on the billing instance.
