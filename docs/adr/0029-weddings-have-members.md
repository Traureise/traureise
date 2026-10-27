---
status: accepted
date: 2026-10-27
decision-makers: Traureise maintainers
---

# Weddings have members instead of an owner

## Context and Problem Statement

A wedding had exactly one owner account (`weddings.owner_id`); everyone else got "not found". A wedding is planned
by two partners and often by helpers such as a planner or the best man, who must change dates, the schedule, the
guest list, the website and the cards. How do several accounts work on one wedding, and what happens to the
wedding's mail, its purchases and its data when one of them leaves?

## Considered Options

* One owner plus delegates (the owner shares access, keeps special rights)
* Permissions per tab or feature
* Members with one of two roles for the whole wedding

## Decision Outcome

Chosen option: "Members with one of two roles for the whole wedding", because both partners are equals, helpers
need the whole wedding rather than slices of it, and two roles keep the access check one comparison.

* `wedding_members` (wedding, user, role) replaces `weddings.owner_id` as the source of access. `editor` can change
  everything in the wedding; `admin` can additionally manage members and the contact person, buy packages and
  delete the wedding. `loadWedding(deps, userId, weddingId, min)` is the only check; a non-member gets the same
  `NotFoundError` as before, and so does an editor reaching an admin-only action.
* All admins are equal. Whoever created the wedding is only its first admin. A wedding always keeps one admin: the
  last admin cannot leave, be demoted or be removed.
* Admins invite by email address and role. The link (valid 14 days, bound to that address, `/einladung`) logs the
  invitee in and adds the membership in one step. Inviting again replaces the pending invitation.
* The wedding's own mail goes to **all admins** (RSVP notifications, daily summary, the warning that guest data will
  be deleted). Mail to guests uses one **contact person** as reply-to, chosen per wedding; if that person leaves it
  falls back to an admin.
* Purchases are visible to admins only, each with "gekauft von". The invoice stays with the buyer
  (`entitlements.purchased_by`, `SET NULL` when the buyer's account goes).
* Deleting an account removes the user's memberships, not the wedding. Uploads belong to the wedding, not to who
  uploaded them. A wedding where the user is the only member is deleted with the account; **deletion is blocked
  while the user is the last admin of a wedding that has other members**, and the page lists those weddings.
* Migration 0011 turns every existing owner into an admin who is also contact person and buyer of the wedding's
  packages, so traureise.de's data stays valid.

"One owner plus delegates" was dropped because the partners are not owner and helper, and ownership would need a
transfer flow and an answer for the owner deleting their account. "Per tab or feature" was dropped because every
helper we know of needs all tabs, and a permission matrix is more to build, explain and get wrong than it saves.

### Consequences

* Good, because deleting one partner's account no longer breaks the wedding for the other.
* Good, because the check is the same everywhere: one function with a minimum role.
* Bad, because any admin can delete the wedding or remove another admin; there is no owner to protect against that.
* Bad, because an editor cannot see or spend money, but also cannot let a helper buy a package; an admin has to.

### Confirmation

Unit tests for `loadWedding` roles, member and invitation use cases, last-admin rules, mail recipients and account
deletion; integration tests for the repositories and migration 0011; an E2E test with two accounts (invite via
Mailpit, edit as editor, admin-only action refused, last admin cannot leave, account deletion keeps the wedding).
