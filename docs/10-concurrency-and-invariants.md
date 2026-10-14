# 10. Concurrency and invariants

The app is used by a team at once: everyone votes within minutes of an announcement, and several people RSVP for the last seats at the same moment.
The code is shaped around a few rules that make that safe. Break one and you reintroduce lost votes or a corrupted queue.

## The constraints we work under

- The database driver is **Neon over HTTP** (`drizzle-orm/neon-http`). There are **no interactive transactions**. The only atomic unit is **`db.batch([...])`**, a list of statements sent together and run in one transaction.
- Serverless instances share nothing in memory. Every rule must hold against the database, not against process state.

## Design rules

1. **One row per member per event, written only by that member.** `responses` has primary key `(event_id, member_id)`. Two people never write the same row, so concurrent votes and RSVPs cannot clobber each other. The only exceptions are listed in rule 7.
2. **Compute on read, never store derived counts.** Seat count, confirmed list, waitlist, per-seat share, "all paid" and "who is pending" are recomputed from rows by `rollCall`, `shareOf`, `allPaid`, `pendingVoters`. Do **not** add stored counters or a stored queue; two concurrent RSVPs would race on them.
3. **Queue order is data, not state.** Position is `goingAt` (a timestamp), with `memberId` as tie-break. Changing capacity, someone leaving or a hold expiring reshuffles the queue for free.
4. **Filter inside the statement.** Votes are intersected with the days and places that exist *at write time* (`currentDays`, `currentVenueIds` subqueries). A vote can never reference a day or place removed a moment earlier. When part of a request is dropped the API returns `daysChanged` / `venuesChanged` and the client refreshes.
5. **Lock the event row when ordering matters.** Day suggestions and place changes take `FOR SHARE` / `FOR UPDATE` on the event row as the first statement of a batch, so they serialize with votes without making voters block each other.
6. **Guarded, conditional writes.** State changes are written as `UPDATE … WHERE <the state the decision was made in>` (stage, date, place, deadline, unpaid, still unanswered). If another request got there first, the guard matches nothing and the API answers `stageClosed` instead of overwriting. Examples: lock/edit attendance writes, `releaseExpired`, "first claim wins" on member names, single-use invite burn, `POST /api/me/signout-others` (`WHERE <current token still matches>`) and `POST /api/events/:id/key` (`WHERE manage_key_hash = current`).
7. **Bulk writes to other members' rows are rare, batched and guarded.** They happen only in: lock, plan edit, reopen-to-poll, entering the bill and completing (`server/utils/attendance.ts`, always in the same batch as the event UPDATE), plus the organizer's per-row overrides. They never change an explicit answer or a paid row.
8. **Increments, not overwrites, for money.** `addPaid` adds to `paidAmount` in SQL, so a payment reported at the same moment as an organizer correction cannot erase it.
9. **Time comparisons that decide ownership use the database clock** (`now()`), or the server clock for the request, never the browser's. Hold deadlines are compared at millisecond precision because JavaScript dates lose Postgres microseconds.
10. **Held seats expire on read.** Every seat reader goes through `seated()`; `releaseExpired` only tidies rows. It runs *before* `reconfirm_by` is rewritten, and only while the stored deadline still equals the one it read, so a new deadline can never revive an expired hold.

## Invariants (must always be true)

- A row has `derived` only if `status = 'going'` (DB check).
- `guests` is 0 to 10, `paid_amount` ≥ 0, `stage` is one of four values (DB checks).
- A co-host row is `invited` with an invite hash **or** `active` with a key hash, never both and never neither (DB check).
- An explicit answer is never overwritten by a derived write (guard in `attendanceWrites`).
- A paid row is never touched by derivation, hold release or reopen.
- Poll days: between 1 and 20 while polling; every member's `days` ⊆ the event's `pollDays`.
- Once an event is past `poll`, it has a `startsAt`.
- Forward stage moves are one step; the only skip is `rsvp → settled` for a started event with no bill.
- Only the key hash is stored for the manage key, co-host keys, invites and sign-in tokens; the secret is shown once.
- Waitlist is strictly first-come: once a party doesn't fit, nobody behind it is seated.

## Where the rules are tested

- `test/event.test.ts`: pure logic (waitlist, split, payments, voting window, plan and attendance derivation, next step, name match, VietQR, calendar grid, day comparison). Run with `npm test`.
- `test/api/*.test.ts`: the real server against a real database: attendance, permissions, identity, voting, days, completion, reconfirm, co-hosts. Run with `npm run test:api`; it builds the app, migrates the database, starts the server on port 3999 and removes the `zz-test-` data it created.

A rule worth testing is usually a rule that belongs in `shared/utils/`. Put it there and add a case to `test/event.test.ts`.
