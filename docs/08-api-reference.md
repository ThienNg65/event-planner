# 8. API reference

All routes are Nitro handlers under `server/api/`. Bodies and responses are JSON. Errors are thrown with
`createError({ statusCode, statusMessage: '<code>' })`; the client turns the code into text via `err.<code>` in both locale files (`app/utils/errMsg.ts`), falling back to `err.generic`.
Every handler validates its own input (there is no shared schema layer): `server/utils/http.ts` (`clean`, `intIn`, `readJson`) and `server/utils/eventFields.ts`.

**Auth columns below**: *none* = public; *signed in* = valid `sid` cookie; *self* = the body's member id must be the signed-in member unless the caller is an organizer (`requireSelf`); *organizer* / *host* = see [03](03-identity-and-roles.md). The manage key travels in the `x-manage-key` header.

## Members and identity

| Method and path | Auth | Purpose | Notable errors |
|---|---|---|---|
| `GET /api/members` | none | Roster `[{ id, name, claimed }]`, sorted by name; archived members left out | |
| `POST /api/members` `{name}` | none | Create a member and sign this browser in (201). An archived, never-claimed, non-organizer name is reused and un-archived | `nameRequired`, `nameTaken` |
| `POST /api/members/:id/claim` | none | Sign in as an unclaimed, non-organizer member | `unknownMember`, `nameClaimed`, `nameOrganizer` |
| `POST /api/members/:id/archive` | signed in, has created an event | Hide a member from the roster ([03](03-identity-and-roles.md#archived-members)) | `signInFirst`, `organizersOnly`, `unknownMember` |
| `GET /api/me` | none | The signed-in member `{ id, name, organizer }` or `null` | |
| `POST /api/me/link` | signed in | `{ token }` to build a sign-in link | `signInFirst` |
| `POST /api/me/rotate` | signed in | New sign-in token and cookie; the old link and all other devices stop working. Returns `{ ok: true }` | `signInFirst`, `signInInvalid` (lost a race with another sign-in change) |
| `POST /api/me/signin` `{token}` | none | Sign in from a link; un-archives the member | `signInInvalid` |
| `POST /api/me/signout` | none | Clear this browser's cookie | |

## Events

| Method and path | Auth | Purpose | Notable errors |
|---|---|---|---|
| `GET /api/events` | none | All events with seats, answered count, `allPaid`, `manager`, and the visitor's `mine` (newest first) | |
| `POST /api/events` | signed in | Create; returns `{ id, key }` (201). Ignores `stage` and `reconfirmBy` in the body | `signInFirst`, `titleRequired`, `invalidDate`, `startsInPast`, `invalidDays`, `invalidLink`, `invalidCapacity`, `invalidBank`, `invalidCover`, `unknownMember` |
| `GET /api/events/:id` | none (role from key/session) | Full detail (see below) | `notFound` |
| `PATCH /api/events/:id` | organizer (some moves host) | Edit, stage moves, cancel/restore, close/reopen voting, day diffs, corrections | many, see below |
| `DELETE /api/events/:id` | host | Delete with cascade | `hostOnly`, `forbidden` |
| `POST /api/events/:id/key` | host, and the current manage key in `x-manage-key` (sign-in as creator is not enough) | Replace the manage key (guarded on the current hash); returns `{ key }` once | `hostOnly`, `forbidden`, `manageKeyRequired`, `keyChanged` |
| `GET /api/events/:id/ics` | none | iCalendar file (`text/calendar`, attachment `event-<id>.ics`): UTC start, 2 h, venue, link, note, `STATUS:CANCELLED` when cancelled; built by `icsOf` in `shared/utils/ics.ts` | `notFound` (also when the event has no start time) |
| `GET /api/events/:id/card` | none | 1200×630 PNG: cover + QR of the event link (used as `og:image`); redirects to `/icon-512.png` on any failure | |

### `GET /api/events/:id` response

`event` (all columns except the key hashes), `role`, `manager` (role is not null), `hasCoHost` (legacy key exists), `cohosts` (`memberId, name, invitedAt, status` where pending invites older than 7 days read `expired`; pending/expired only for organizers),
`hostName`, `votingOpen`, `responses` (every member's row plus `name`), `confirmed` (member ids with seats), `waitlist` (ids in queue order), `held` (ids with a live hold), `seats`, `share`, `venues` (each with `upvotes: memberId[]`, sorted by upvotes).

Everything is public by design ([03](03-identity-and-roles.md#34-security-properties-worth-remembering)).

### `PATCH /api/events/:id`: which body does what

The handler tests, in this order:

| Body contains | Meaning | Who | Errors |
|---|---|---|---|
| `restore:true` or `cancel` | Restore / cancel (`cancel` is the reason, ≤ 200) | host | `hostOnly` |
| (event is cancelled) | any other change | n/a | `cancelled` |
| `correct:true` + `notice` + `startsAt`/`venue`/`venueLink` | Correct a frozen plan; nothing else allowed | organizer | `stageClosed` (not frozen), `invalid`, `invalidDate` |
| `closeVoting:true` | Close voting now | organizer | `stageClosed` |
| `addDays` / `removeDays` | Day diffs (stage `poll`) | organizer | `invalidDays`, `daysRequired`, `tooManyDays`, `daysChanged`, `stageClosed`, `invalid` (cannot mix with `pollDays`, a stage move or a plan change) |
| `stage` | Move: forward one step by organizer, backward by host, the single skip `rsvp → settled`. Leaving `rsvp` needs the event to have started; a lock needs a future start | organizer / host | `stageClosed`, `notStarted`, `startsInPast`, `hasPayments`, `invalidDate`, `hostOnly` |
| `reopenVoting:true` + `voteDeadline` | Reopen voting; also validates the move to `poll` | organizer (host if leaving a later stage) | `invalid`, `invalidDate` |
| any of `title, note, pollDays, startsAt, venue, venueLink, capacity, billTotal, bankId, bankAccount, bankHolder, cover, theme, honorees, notice, voteDeadline, reconfirmBy` | Field edits, validated by `eventFields` | organizer | `planFrozen` for date/place once frozen; `startsInPast` for a changed `startsAt` in the past; `votingClosed` for a deadline edit on a closed poll |
| `acknowledgePayments:true` | Required when reopening to `poll` with payments | host | `hasPayments` |

Multi-row effects (attendance derivation, hold release) run in one `db.batch` together with the event UPDATE, guarded on the event still being in the stage the decision was made in; a lost race returns `stageClosed`.

## Answers, suggestions

| Method and path | Auth | Body | Purpose | Notable errors |
|---|---|---|---|---|
| `PUT /api/events/:id/response` | self | `memberId` + any of `days`, `venueIds`, `status` (+`guests`), `paid`, `addPaid`, `paidAmount` | Write the member's own row ([04](04-polling-and-locking.md), [05](05-rsvp-and-seats.md), [06](06-bill-and-payments.md)) | `unknownMember`, `notYou`, `cancelled`, `stageClosed`, `votingClosed`, `invalidDays`, `unknownVenue`, `invalidGuests`, `invalid`, `daysChanged`, `venuesChanged`, `notAttending` (participant paying without a seat) |
| `POST /api/events/:id/days` | self | `memberId`, `day` | Suggest (or vote for) a day | `invalidDays`, `tooManyDays`, `daysChanged`, `stageClosed`, `votingClosed` |
| `POST /api/events/:id/venues` | self | `addedBy`, `name`, `link?`, `note?` | Suggest a place (201) | `nameRequired`, `invalidLink`, `venueExists` (with `data.id`), `stageClosed` |
| `DELETE /api/events/:id/venues/:venueId` | organizer | | Remove a place and its upvotes | `cancelled`, `notFound` |

## Co-hosts

| Method and path | Auth | Purpose | Notable errors |
|---|---|---|---|
| `POST /api/events/:id/cohosts` `{memberId, reissue?}` | host | Create or re-issue an invite; returns `{ invite }` once | `alreadyCohost`, `tooManyCohosts`, `cancelled`, `unknownMember` |
| `POST /api/events/:id/cohosts/peek` `{invite}` | none | Who the invite is for and whether it is valid or expired | `inviteInvalid` |
| `POST /api/events/:id/cohosts/accept` `{invite}` | signed in as the invitee | Exchange the invite for an access key `{ key }` | `inviteInvalid`, `inviteExpired`, `notYou`, `cancelled` |
| `POST /api/events/:id/cohosts/decline` `{invite}` | holder of the invite | Remove the pending row | `inviteInvalid` |
| `DELETE /api/events/:id/cohosts/:memberId` | host (any row) or co-host (own row only) | Revoke or leave | `forbidden`, `hostOnly` |
| `POST /api/events/:id/cohost` / `DELETE` | host | Legacy shared co-host key: create or rotate (returns `{ key }` once) / revoke | |

## Common error codes

| Code | HTTP | Meaning |
|---|---|---|
| `notFound` | 404 | Unknown event or route id |
| `invalid` | 400 | Body is not a well-formed request for this endpoint |
| `forbidden` | 403 | No role (participant or visitor) on an organizer action |
| `organizersOnly` | 403 | Archiving a member without having created an event |
| `hostOnly` | 403 | Has a role but not enough (co-host on a host action) |
| `notYou` | 403 | Participant writing another member's row |
| `signInFirst` | 401 | Needs a signed-in member |
| `cancelled` | 409 | The event is cancelled |
| `stageClosed` | 409 | The step is not open in the event's current stage (also a lost batch race) |
| `votingClosed` | 409 | Deadline passed (participants only) |
| `planFrozen` | 409 | Date or place edited after the plan froze; use a correction |
| `daysChanged`, `venuesChanged` | 409 | The list changed under the caller; refresh |
| `hasPayments` | 409 | Reopening to the poll needs `acknowledgePayments` |
| `notStarted` | 409 | Leaving the RSVP stage before the event starts |
| `startsInPast` | 400 | A start time being set (create, lock, date change) has already passed |
| `notAttending` | 409 | A participant without a seat reports a payment |

The full list with texts is `err.*` in `i18n/locales/en.json`. **Every new code needs a key in both locale files.**
