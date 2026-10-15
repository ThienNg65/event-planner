# 11. Known behaviours

Things that behave in a way a newcomer would not guess. Some are deliberate, some are simply undecided. Each one says **how we know**
and whether it is a design choice, so you can tell "don't break this" from "this may deserve a change". Treat the list as input to planning, not as a bug list.

Numbers stay fixed: a settled item is removed, so gaps are expected.

Evidence tags: **E2E** = observed in the browser on 2026-10-13 (v0.7.0); **Code** = read from the source, not exercised in a browser.

## Identity and access

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 2 | Signing out asks first. With a PIN it only warns that organizer links are forgotten; without one it asks you to set a PIN or copy your sign-in link, because a claimed name without a PIN can't be picked again. | Code | Deliberate. |
| 3 | The sign-in token is the cookie value, so a sign-in link is a credential for that member until it is cut off. **Sign out other devices** (`POST /api/me/signout-others`) swaps the member's token and deletes every other session, so it kills a leaked link as well as other browsers; an organizer's PIN reset does the same. A member with a PIN must present it for that and for changing the PIN, so a thief holding only a session or link cannot lock the owner out. A member without a PIN has nothing to present: the first one to set a PIN or sign others out wins, so a leak before any PIN exists is a race. | Code | Deliberate simplicity ("no password by design"). If a creator's link leaks, an attacker is host of the creator's events but cannot replace the manage key without holding it (`POST /api/events/:id/key` checks `x-manage-key`). After a leak: set a PIN if you have none, then sign the other devices out. A creator with no copy of the manage key anywhere cannot rotate it. |
| 5 | A name that created an event cannot be claimed from the list, and another organizer cannot reset its PIN (it would hand over host rights). Such a member signs in with their PIN or sign-in link; with neither, only the manage link gets them back, and only as host. | Code | Deliberate (prevents taking over host rights). |
| 6 | A PIN has only 10^6 values and the name list is public, so the lockout is the protection. Anyone can lock a colleague's name for 15 minutes by guessing; an organizer's reset clears it. | Code | Deliberate trade-off for an internal app. |
| 7 | A member who signed in before PINs existed has no PIN and is not in the name list until they set one (from a device that is still signed in) or an organizer resets it. | Code | Transition. |

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

## Privacy

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 28 | The joining link can't be rotated or revoked. | Code | Undecided. |
| 29 | Participants can't be removed. | Code | Undecided. |
| 30 | Events created before private events need the new link; the home list shows the ones you created or answered. | Code | Deliberate. |
| 31 | Archiving a member keeps their access to events they joined, but they no longer count in "no reply yet" or the people strip. | Code | Deliberate. |
| 32 | An event opened only with a manage key (a legacy co-host key, or a host signed in as someone else or signed out) is not listed on home or the calendar: listing follows the signed-in member. Open it by its link. | Code | Undecided. |
| 33 | An organizer answering for a team member (`PUT /response` with their `memberId`) also makes that member a participant, so the event shows on their home. | Code | Deliberate. |
| 34 | Hiding results until you vote is a nudge: someone can vote, see the results and then clear their votes (`hasVoted` is read live), and a visitor who is not signed in sees the poll hidden. Home screen answered counts are not hidden. | Code | Deliberate. |

## Data hygiene

| # | Behaviour | Evidence | Intent |
|---|---|---|---|
| 26 | Deleting an event cascades to its responses, places and co-hosts; the members stay. | Code | Deliberate. |
| 27 | There are no notifications of any kind. People only learn something changed by opening the app; the home to-do list is the nudge. | Code | Deliberate for now. |

When you decide one of the "Undecided" items, change the behaviour *and* move the line here to the relevant chapter (or delete it).
