# 8. API reference

All routes are Nitro handlers under `server/api/`. Bodies and responses are JSON. Errors are thrown with
`createError({ statusCode, statusMessage: '<code>' })`; the client turns the code into text via `err.<code>` in both locale files (`app/utils/errMsg.ts`), falling back to `err.generic`.
Every handler validates its own input (there is no shared schema layer): `server/utils/http.ts` (`clean`, `intIn`, `readJson`) and `server/utils/eventFields.ts`.

**Auth columns below**: *none* = public; *signed in* = valid `sid` cookie; *self* = the body's member id must be the signed-in member unless the caller is an organizer (`requireSelf`); *organizer* / *host* = see [03](03-identity-and-roles.md). The manage key travels in the `x-manage-key` header.

## Members and identity

| Method and path | Auth | Purpose | Notable errors |
|---|---|---|---|
| `GET /api/members` | none | Roster `[{ id, name, claimed, hasPin }]`, sorted by name; archived members left out | |
| `POST /api/members` `{name, pin}` | none | Create a member with a PIN and sign this browser in (201). An archived, never-claimed, non-organizer name is reused and un-archived | `nameRequired`, `nameTaken`, `pinFormat`, `pinWeak` |
| `POST /api/members/:id/claim` `{pin}` | none | Sign in as an unclaimed, non-organizer member and set its PIN | `unknownMember`, `nameClaimed`, `nameOrganizer`, `pinFormat`, `pinWeak` |
| `POST /api/members/:id/signin` `{pin}` | none | Sign in with the PIN; counts each guess, 5 wrong PINs lock the name for 15 minutes; un-archives | `pinWrong` (401), `pinLocked` (429) |
| `POST /api/members/:id/pin-reset` | signed in, has created an event | New random PIN `{ pin }` for a member; signs them out everywhere (PIN swap and session delete are one batch) | `signInFirst`, `organizersOnly`, `unknownMember`, `pinResetOrganizer` |
| `POST /api/members/:id/archive` | signed in, has created an event | Hide a member from the roster ([03](03-identity-and-roles.md#archived-members)) | `signInFirst`, `organizersOnly`, `unknownMember` |
| `GET /api/me` | none | The signed-in member `{ id, name, organizer, hasPin, emailEnabled, email }` or `null`; `email` is `{ address, muted, cooldownUntil }` or `null`, shown only to its owner | |
| `POST /api/me/pin` `{pin, currentPin}` | signed in; `currentPin` required when the member has a PIN | Set or change this member's PIN (a wrong `currentPin` counts toward the sign-in lockout) | `signInFirst`, `pinFormat`, `pinWeak`, `pinWrong`, `pinLocked` |
| `POST /api/me/link` | signed in | `{ token }` to build a sign-in link | `signInFirst` |
| `POST /api/me/signout-others` `{currentPin}` | signed in; `currentPin` required when the member has a PIN | New sign-in token and cookie for this browser; deletes the member's other `member_sessions` and kills the old sign-in link, so every other device is signed out (the PIN is unchanged). One guarded batch. Returns `{ ok: true }` | `signInFirst`, `pinWrong`, `pinLocked`, `signInInvalid` (lost a race with another sign-in change) |
| `POST /api/me/signin` `{token}` | none | Sign in from a link; un-archives the member | `signInInvalid` |
| `POST /api/me/signout` | none | Clear this browser's cookie | |
| `GET /api/email-enabled` | none | `{ enabled }`: whether email is switched on ([13](13-email.md)) | |
| `POST /api/me/email` `{email, consent, currentPin, locale}` | signed in, has a PIN | Mail a 6-digit code to a new address; nothing is saved yet. 1 per 60 s, 5 a day | `emailOff` (404), `signInFirst`, `consentRequired`, `emailInvalid`, `emailDomain`, `pinRequired` (409), `emailSame` (409), `pinWrong`, `pinLocked`, `emailTooSoon` (429), `mailBudget` (429), `mailFailed` (502) |
| `POST /api/me/email/verify` `{code, locale}` | signed in | Confirm the code: saves the address and consent; a replaced address starts the 72 h cool-down and gets the "not me" mail | `emailOff`, `signInFirst`, `codeInvalid` (400; 5 wrong tries burn the code) |
| `DELETE /api/me/email` `{currentPin}` | signed in | Remove the address and any pending code | `emailOff`, `signInFirst`, `pinWrong`, `pinLocked` |
| `POST /api/me/email/revert` `{token}` | none (signed token) | The "not me" button: restore the previous address, sign the member out everywhere, rotate the token. The page `/email/revert#t=` only shows the button | `emailOff`, `revertInvalid` |
| `POST /api/me/email/mute` `{kind, muted}` | signed in | Switch one kind of event email (`planSet`, `paymentRequested`, `paymentRecorded`, `cancelled`) off or on for this member | `emailOff`, `signInFirst`, `invalid` |
| `GET /api/unsubscribe?t=&l=` | none (signed token) | The link in every event mail: an HTML page that asks to confirm. Changes nothing | `emailOff`, `unsubscribeInvalid` |
| `POST /api/unsubscribe?t=&l=` | none (signed token) | Mutes the kind the token names, for its member; the confirm page's button and the `List-Unsubscribe-Post` one-click target. Answers an HTML page either way | `emailOff`, `unsubscribeInvalid` |
| `POST /api/members/:id/recover` | none | Mail a recovery code to the verified address (or, in the 72 h cool-down, the previous one). Always `{ sent: true }`; caps 1/60 s and 3/day per member, 15/day overall | `emailOff`, `unknownMember` (bad id format only), `mailBudget` |
| `POST /api/members/:id/recover/confirm` `{code, newPin}` | none | Set a new PIN with the code, sign in here, sign out elsewhere, send a "PIN was reset" notice. Open to organizers | `emailOff`, `pinFormat`, `pinWeak`, `codeInvalid` |

## Events

| Method and path | Auth | Purpose | Notable errors |
|---|---|---|---|
| `GET /api/events` | signed in (signed out → `[]`) | Only my events (I created it or have an answer row): seats, answered count, `allPaid`, `manager`, `mine` (newest first) | |
| `POST /api/events` | signed in | Create; returns `{ id, key }` (201). Ignores `stage` and `reconfirmBy` in the body | `signInFirst`, `titleRequired`, `invalidDate`, `startsInPast`, `invalidDays`, `invalidLink`, `invalidCapacity`, `invalidGuests`, `invalidBank`, `invalidCover`, `unknownMember` |
| `GET /api/events/:id` | `requireAccess`: a role, the joining key (`x-join-key`), or a participant | Full detail (see below). Signed in with the key, it joins you (`joinedNow`) | `notFound` |
| `PATCH /api/events/:id` | organizer (some moves host) | Edit, stage moves, cancel/restore, close/reopen voting, day diffs, corrections | many, see below |
| `DELETE /api/events/:id` | host | Delete with cascade | `hostOnly`, `forbidden` |
| `POST /api/events/:id/key` | host, and the current manage key in `x-manage-key` (sign-in as creator is not enough) | Replace the manage key (guarded on the current hash); returns `{ key }` once | `hostOnly`, `forbidden`, `manageKeyRequired`, `keyChanged` |
| `GET /api/events/:id/ics` | an organizer, a participant, or the joining key in `?j=` (a plain download link can't send `x-join-key`) | iCalendar file (`text/calendar`, attachment `event-<id>.ics`): UTC start, 2 h, venue, joining link, note, `STATUS:CANCELLED` when cancelled; built by `icsOf` in `shared/utils/ics.ts` | `notFound` (no access, or no start time) |
| `GET /api/events/:id/card?j=<joinKey>` | the joining key in `j` | 1200×630 PNG: cover + QR of the joining link (used as `og:image`); redirects to `/icon-512.png` without the key or on any failure | |

### `GET /api/events/:id` response

Also `joinedNow` (this visit made you a participant) and `participants` (`{ id, name }`, by name), which the UI uses for counts and the avatar strip. `PUT /response`, `POST /days` and `POST /venues` also go through `requireAccess`, and so do the organizer-only endpoints (PATCH, DELETE, cohost, venue delete) before their role check, so a stranger gets `notFound` rather than 403.

`event` (all columns except the key hashes and the handover offer), `role`, `manager` (role is not null), `hasCoHost` (legacy key exists), `cohosts` (`memberId, name, invitedAt, status` where pending invites older than 7 days read `expired`; pending/expired only for organizers),
`handover` (`{ to, name, at, mine }` or null; only for the signed-in creator and the offered co-host), `handoverOptions` (`{ memberId, name }[]`, the co-hosts the signed-in creator may offer the event to),
`hostName`, `hostKey` (the sent `x-manage-key` still matches the manage key), `votingOpen`, `responses` (every member's row plus `name` and `voted`; while `votesHidden` is true, other members' `days`, `venueIds`, `maybeDays` and `maybeVenueIds` are emptied, see [04](04-polling-and-locking.md#47-hiding-results-until-you-vote)), `confirmed` (member ids with seats), `waitlist` (ids in queue order), `held` (ids with a live hold), `seats`, `share`, `venues` (each with `upvotes: memberId[]` and `maybe: memberId[]` for "if need be", sorted by upvotes, then if need be).

Events are private to organizers, joining-key holders and participants ([03](03-identity-and-roles.md#34-security-properties-worth-remembering)).

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
| any of `title, note, pollDays, startsAt, venue, venueLink, capacity, maxGuests, hideVotes, billTotal, bankId, bankAccount, bankHolder, cover, theme, honorees, notice, voteDeadline, reconfirmBy` | Field edits, validated by `eventFields` | organizer | `planFrozen` for date/place once frozen; `startsInPast` for a changed `startsAt` in the past; `votingClosed` for a deadline edit on a closed poll |
| `acknowledgePayments:true` | Required when reopening to `poll` with payments | host | `hasPayments` |

Multi-row effects (attendance derivation, hold release) run in one `db.batch` together with the event UPDATE, guarded on the event still being in the stage the decision was made in; a lost race returns `stageClosed`. The same batch carries the notification rows for a lock, a date or place change, a bill request and a cancellation ([13](13-email.md#event-emails-the-outbox)); mails go out after the commit, so the response can be a moment slower (at most about 3 s on Netlify).

## Answers, suggestions

| Method and path | Auth | Body | Purpose | Notable errors |
|---|---|---|---|---|
| `PUT /api/events/:id/response` | self | `memberId` + any of `days`, `venueIds`, `maybeDays`, `maybeVenueIds`, `status` (+`guests`), `paid`, `addPaid`, `paidAmount` | Write the member's own row ([04](04-polling-and-locking.md), [05](05-rsvp-and-seats.md), [06](06-bill-and-payments.md)) | `unknownMember`, `notYou`, `cancelled`, `stageClosed`, `votingClosed`, `invalidDays`, `unknownVenue`, `invalidGuests`, `tooManyGuests`, `invalid`, `daysChanged`, `venuesChanged`, `notAttending` (participant paying without a seat) |
| `POST /api/events/:id/days` | self | `memberId`, `day` | Suggest (or vote for) a day | `invalidDays`, `tooManyDays`, `daysChanged`, `stageClosed`, `votingClosed` |
| `POST /api/events/:id/venues` | self | `addedBy`, `name`, `link?`, `note?` | Suggest a place (201) | `nameRequired`, `invalidLink`, `venueExists` (with `data.id`), `stageClosed` |
| `DELETE /api/events/:id/venues/:venueId` | organizer | | Remove a place and its votes (yes and if need be) | `cancelled`, `notFound` |
| `GET /api/place-name?url=` | none | | The place name behind a `https://maps.app.goo.gl/…` short link (`{ name }`, `null` if unknown), to prefill a venue name. Fetches only that host, 3 s timeout. | none (always 200) |

## Co-hosts

| Method and path | Auth | Purpose | Notable errors |
|---|---|---|---|
| `POST /api/events/:id/cohosts` `{memberId, reissue?}` | host | Create or re-issue an invite; returns `{ invite }` once | `alreadyCohost`, `tooManyCohosts`, `cancelled`, `unknownMember` |
| `POST /api/events/:id/cohosts/peek` `{invite}` | none | Who the invite is for and whether it is valid or expired | `inviteInvalid` |
| `POST /api/events/:id/cohosts/accept` `{invite}` | signed in as the invitee | Exchange the invite for an access key `{ key }` | `inviteInvalid`, `inviteExpired`, `notYou`, `cancelled` |
| `POST /api/events/:id/cohosts/decline` `{invite}` | holder of the invite | Remove the pending row | `inviteInvalid` |
| `DELETE /api/events/:id/cohosts/:memberId` | host (any row) or co-host (own row only) | Revoke or leave | `forbidden`, `hostOnly` |
| `POST /api/events/:id/handover` `{to}` | signed-in creator | Offer the event to an active co-host with a PIN; replaces an earlier offer ([03](03-identity-and-roles.md#35-handing-an-event-over)) | `creatorOnly`, `handoverTarget`, `cancelled`, `unknownMember` |
| `DELETE /api/events/:id/handover` | signed-in creator or target | Withdraw or decline the pending offer (nothing pending is fine) | `signInFirst` |
| `POST /api/events/:id/handover/accept` | signed in as the offered co-host | Take the event over; returns the new manage key `{ key }` once | `signInFirst`, `handoverGone`, `cancelled`, `forbidden` |
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
| `pinWrong` | 401 | Wrong PIN, unknown name, or a name without a PIN (deliberately the same answer) |
| `pinLocked` | 429 | 5 wrong PINs; the name is locked for 15 minutes |
| `pinFormat`, `pinWeak` | 400 | A PIN being set is not 6 digits, or is all alike / a run like 123456 |
| `pinResetOrganizer` | 403 | Resetting the PIN of a member who has created an event |
| `emailOff` | 404 | Email is not switched on |
| `consentRequired`, `emailInvalid`, `emailDomain`, `pinRequired`, `emailSame` | 400 / 409 | Adding an email without consent, with a bad or disallowed address, without a PIN, or the same address |
| `emailTooSoon` | 429 | A code was sent less than 60 s ago, or the daily limit is reached |
| `mailBudget`, `mailFailed` | 429, 502 | The 24 h mail budget is used up; the provider refused the mail |
| `codeInvalid` | 400 | Wrong, expired, burned or missing one-time code (deliberately one answer) |
| `revertInvalid` | 400 | "Not me" token malformed, forged, used, or past its 72 h |
| `unsubscribeInvalid` | 400 | Unsubscribe link malformed or forged |
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
