---
status: accepted
date: 2026-10-18
decision-makers: Traureise maintainers
---

# Account export and deletion

## Context and Problem Statement

Users have the right to access and port their data (DSGVO Art. 15, 20) and to have it erased (Art. 17).
How do they exercise these rights without involving the operator?

## Considered Options

* Self-service under `/konto`: ZIP export and account deletion
* Requests by email, handled manually by the operator

## Decision Outcome

Chosen option: "Self-service under `/konto`", because it works on every instance without effort for the
operator.

* **Export** (`ExportAccount`): a ZIP with `data.json` (account, websites, sections, items, purchases and
  a file list) and every stored image under `images/`, built by an `ArchiveWriter` port (fflate).
* **Deletion** (`DeleteAccount`): confirmed by typing the account's email address. All user data hangs off
  `users.id` with `ON DELETE CASCADE`, so one delete removes websites, sections, items, uploads,
  entitlements and sessions. Afterwards the use case deletes every stored file, the magic-link tokens and
  the rate-limit entries for the email address, and the action clears the session cookie.
* Rows are deleted before files, so a failing file delete can leave an orphaned file but never a
  half-deleted account.
* The email address can sign up again and gets a new, empty account.

### Consequences

* Good, because no personal data remains after deletion, including login traces keyed by email.
* Bad, because deletion is immediate and cannot be undone; the page says so.

### Confirmation

Unit tests with fakes, integration tests with real repositories, local storage and the real ZIP writer,
and an E2E test that unzips the download and checks that the deleted user's image URL returns 404 (the
upload route reads storage directly).
