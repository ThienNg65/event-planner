# 11. Known behaviours

Things that behave in a way a newcomer would not guess. Some are deliberate, some are simply undecided. Each one says **how we know**
and whether it is a design choice, so you can tell "don't break this" from "this may deserve a change". Treat the list as input to planning, not as a bug list.

Numbers stay fixed: a settled item is removed, so gaps are expected.

Evidence tags: **E2E** = observed in the browser on 2026-10-13 (v0.7.0); **Code** = read from the source, not exercised in a browser.

## Identity and access

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 2 | Signing out asks first, because a claimed name can't be picked again; only the sign-in link brings it back. | E2E | Deliberate. |
| 3 | The sign-in token is the cookie value, so a sign-in link is a permanent credential for that member until the member is deleted. There is no rotation or revoke. | Code | Deliberate simplicity ("no password by design"). |
| 5 | A name that created an event cannot be claimed from the list, so such a member must use a sign-in or manage link to come back. | Code | Deliberate (prevents taking over host rights). |

## Dates and stages

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 10 | Moving a locked date holds **every derived seat whose votes don't match the new day**, even if the new day is one nobody voted for. Voters of the old day get a 48 h confirm-by window. | E2E | Deliberate. |
| 11 | "Started" is clock-based and is not a stage. After the start time the stage is still `rsvp` (badge "Awaiting the bill"); the next-step card just stops asking for RSVPs and offers the bill. The server still accepts RSVP writes during `rsvp`. | Code | Deliberate. |
| 12 | A poll past its deadline is still stage `poll`. Only Lock advances it; there is no auto-lock. | Code | Deliberate. |

## Seats and answers

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 15 | **Strict first-come**: a party that doesn't fit blocks everyone behind it, even a single person who would fit. | Code, tests | Deliberate ("fair queue"). |
| 16 | Adding guests sends the member to the back of the queue. | Code, tests | Deliberate. |
| 18 | Only members with explicit answers keep them across a lock or plan change; voters who don't fit are asked to confirm but are not removed. | Code, tests | Deliberate. |

## Money

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 20 | The collectable total can exceed the bill because the share rounds **up** to 1,000 ₫ per seat (100,000 ₫ over 3 seats collects 102,000 ₫). | E2E | Deliberate; the page explains the rounding. |
| 22 | The host is also a payer (owes `share × (1 + guests)`). With no bank details, the host sees "the organizer hasn't entered a bank account, pay directly", addressed to themselves. | E2E | Undecided. |
| 23 | Completing with unpaid members is allowed (host or co-host); a confirm dialog lists debtors. They can keep reporting payments afterwards; only organizers set or clear amounts. | E2E | Deliberate. |
| 24 | The bill dialog shows the raw number (`100000`) with no separators and no per-seat preview; amounts elsewhere use `vi-VN` grouping (`100.000 ₫`), also in English. | E2E | Undecided. |

## Data hygiene

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 26 | Deleting an event cascades to its responses, places and co-hosts; the members stay. | Code | Deliberate. |
| 27 | There are no notifications of any kind. People only learn something changed by opening the app; the home to-do list is the nudge. | Code | Deliberate for now. |

When you decide one of the "Undecided" items, change the behaviour *and* move the line here to the relevant chapter (or delete it).
