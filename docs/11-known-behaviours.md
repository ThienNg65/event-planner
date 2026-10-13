# 11. Known behaviours

Things that behave in a way a newcomer would not guess. Some are deliberate, some are simply undecided. Each one says **how we know**
and whether it is a design choice, so you can tell "don't break this" from "this may deserve a change". Treat the list as input to planning, not as a bug list.

Evidence tags: **E2E** = observed in the browser on 2026-10-13 (v0.7.0); **Code** = read from the source, not exercised in a browser.

## Identity and access

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 1 | **A manage key outlives the sign-in.** Keys live in `localStorage` (`te:keys`), and signing out clears only the cookie. After signing out as the host and signing in as someone else in the same browser profile, the page still shows Edit, Lock and Complete, says "Your role: Organizer", and the server honours the key. | E2E | By design for "host on a device where you are not signed in as yourself", but it also hands host power to whoever uses that browser next. |
| 2 | Signing out asks first, because a claimed name can't be picked again; only the sign-in link brings it back. | E2E | Deliberate. |
| 3 | The sign-in token is the cookie value, so a sign-in link is a permanent credential for that member until the member is deleted. There is no rotation or revoke. | Code | Deliberate simplicity ("no password by design"). |
| 4 | **Everything is readable by anyone**: all events, every member's votes, answers and payments, and the event's bank id, account number and holder. | Code | Team-internal assumption; no per-event privacy. |
| 5 | A name that created an event cannot be claimed from the list, so such a member must use a sign-in or manage link to come back. | Code | Deliberate (prevents taking over host rights). |
| 6 | The roster is every member ever created, and "not replied yet" is measured against all of them, so the count includes people who will never take part. Test or leftover members inflate it. | E2E | Undecided: there is no per-event audience and no way to remove a member in the product. |

## Dates and stages

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 7 | **"Enter bill" is hidden until the start time, but only in the UI.** The next-step logic offers it when the event has started; the server accepts `stage:'bill'` at any time for an organizer. | Code (UI gating E2E) | The UI rule is intended; the server leniency is probably unintended. |
| 8 | The server does not require a date to be in the future on create or lock. An event can be created a few minutes ahead, or locked into the past. | E2E (created 7 min ahead), Code | Undecided. |
| 9 | Moving an `rsvp` event's date into the past is refused only **when it would hold seats** (`reconfirmTooLate`, "the new time has passed"). When no one would be held (a fixed-date event, or nobody derived), the move is not checked. | E2E (refused with holds), Code (the other case) | Probably accidental coverage of the "started" rule. |
| 10 | Moving a locked date holds **every derived seat whose votes don't match the new day**, even if the new day is one nobody voted for. Voters of the old day get a 48 h confirm-by window. | E2E | Deliberate. |
| 11 | "Started" is clock-based and is not a stage. After the start time the stage is still `rsvp` ("Confirmed"); the next-step card just stops asking for RSVPs and offers the bill. The server still accepts RSVP writes during `rsvp`. | Code | Deliberate. |
| 12 | A poll past its deadline is still stage `poll`. Only Lock advances it; there is no auto-lock. | Code | Deliberate. |
| 13 | The lock dialog's time field defaults to **19:00** regardless of event type. The create page's quick-start templates set only a title and a cover. | E2E | Undecided. |
| 14 | The seat limit is not shown on the event page while the event is polling; the going counter (`n/capacity`) appears only after the lock. | Code | Undecided. |

## Seats and answers

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 15 | **Strict first-come**: a party that doesn't fit blocks everyone behind it, even a single person who would fit. | Code, tests | Deliberate ("fair queue"). |
| 16 | Adding guests sends the member to the back of the queue. | Code, tests | Deliberate. |
| 17 | In the UI, status buttons (Going / Maybe / Can't) and day taps **save immediately**, but the guest count needs a separate **Update** button. | E2E | Undecided. |
| 18 | Only members with explicit answers keep them across a lock or plan change; voters who don't fit are asked to confirm but are not removed. | Code, tests | Deliberate. |
| 19 | The lock preview says how many people wait ("1 person waiting") but lists names only for those who get a seat. | E2E | Undecided. |

## Money

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 20 | The collectable total can exceed the bill because the share rounds **up** to 1,000 ₫ per seat (100,000 ₫ over 3 seats collects 102,000 ₫). | E2E | Deliberate; the page explains the rounding. |
| 21 | The server accepts a payment from any signed-in member for their own row, whether or not they are a confirmed attendee and whatever the amount. Overpayment is clamped on read (`left = 0`). | Code | Undecided. |
| 22 | The host is also a payer (owes `share × (1 + guests)`). With no bank details, the host sees "the organizer hasn't entered a bank account, pay directly", addressed to themselves. | E2E | Undecided. |
| 23 | Completing with unpaid members is allowed (host or co-host); a confirm dialog lists debtors. They can keep reporting payments afterwards; only organizers set or clear amounts. | E2E | Deliberate. |
| 24 | The bill dialog shows the raw number (`100000`) with no separators and no per-seat preview; amounts elsewhere use `vi-VN` grouping (`100.000 ₫`), also in English. | E2E | Undecided. |

## Data hygiene

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 25 | No endpoint deletes a member. Cleaning test members needs SQL; the API tests do it in `stopServer()` for `zz-test-` names. | Code | Undecided. |
| 26 | Deleting an event cascades to its responses, places and co-hosts; the members stay. | Code | Deliberate. |
| 27 | There are no notifications of any kind. People only learn something changed by opening the app; the home to-do list is the nudge. | Code | Deliberate for now. |

When you decide one of the "Undecided" items, change the behaviour *and* move the line here to the relevant chapter (or delete it).
