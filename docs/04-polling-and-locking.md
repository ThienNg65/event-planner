# 4. Polling and locking

Stage `poll` collects **votes**: which candidate days each member can make and which suggested places they like.
The organizer then **locks** the plan (`poll → rsvp`), and votes become attendance. After the lock, a changed plan *holds* seats instead of dropping people.

Code: `shared/utils/event.ts` (`compareDays`, `planFor`, `matchesPlan`, `deriveAttendance`, `lockImpact`), `server/utils/attendance.ts`,
`server/api/events/[id].patch.ts`, `.../response.put.ts`, `.../days.post.ts`, `.../venues.post.ts`.

## 4.1 What is being polled

| Poll | Set up by | Stored in | Notes |
|---|---|---|---|
| **Days** | Creator picks up to 20 days on the calendar | `events.pollDays` (`date[]`) | Plain `YYYY-MM-DD`, no time. The time of day is chosen at lock. |
| **Places** | Anyone suggests (only when the event has no fixed venue) | `venues` rows | Upvotes live on the voter's row (`responses.venueIds`; "if need be" in `responses.maybeVenueIds`). |

An event may poll days only, places only, or both. A fixed-date event with no venue polls places only.

## 4.2 Voting

All vote writes are `PUT /api/events/:id/response`, one row per member per event. Each write is filtered **inside the SQL statement**
against the days and places that exist *right now*, so a vote can never reference a removed day or place.

- **Days**: send the full list of days the member can make. A day that was removed meanwhile is dropped and the call returns `daysChanged` (409); the rest is saved and the client refreshes.
- **Places**: send the full list of upvoted place ids. Unknown ids → `venuesChanged`.
- **If need be**: every day and place is Yes, If need be or No (blank). `maybeDays` and `maybeVenueIds` take the same lists as `days` and `venueIds`, filtered the same way (`daysChanged` / `venuesChanged`). The two lists are kept apart: an id sent as yes and as if need be in one request stays yes only, `POST /days` removes the day from the suggester's if-need-be list, and on read a day or place stored in both counts as yes. The poll tallies show yes and if-need-be counts side by side; the leader is the most yes, then the most if-need-be. "Can't join" clears these lists too.
- **"Can't join"** while polling: `status:'no'` clears the member's days and places (so they no longer count toward anything) and removes them from the "not replied" list. `status:null` takes it back. It follows the same voting-window rules as a vote.
- **First vote time**: `firstVotedAt` is set once, on the member's first write of days or places, and never moves, even if they later empty or change their votes. It decides their place in the queue at lock.
- **Who is "pending"**: a roster member with no day, no place (yes or if need be) and not `no` (`pendingVoters`; the same rule as `hasVoted`). When at least one member has voted and none is pending, organizers are nudged to lock.

### Suggesting

- **A day** (`POST /days {memberId, day}`): the day must be today or later in team time, the event must be a day poll (`stageClosed` for fixed-date events), and the poll holds at most 20 days (`tooManyDays`). Suggesting an existing day just adds the suggester's vote. A new day is added and the suggester's vote recorded in one batch.
- **A place** (`POST /venues {addedBy, name, link?, note?}`): name ≤ 100 chars, link must be `http(s)://`, note ≤ 300. Refused (`stageClosed`) when the event already has a fixed venue. A name matching an existing one ignoring case and diacritics returns `venueExists` (409) with `data.id` of the existing place, and the client upvotes that one instead.
- **Removing** a day (`removeDays`) or a place (`DELETE /venues/:id`) is organizer-only. Votes for it are removed in the same batch.

## 4.3 Ranking and the tie-break

`compareDays(days, responses, honorees)` orders days by:

1. number of members who said Yes (descending),
2. then how many said **If need be** (descending),
3. then how many **honorees** can make it with a Yes (descending),
4. then the earlier date.

`tie` reports why the first day beats a second day with the same Yes and If need be counts: `'honorees'` or `'earlier'` (null when there is no tie or no votes).
The lock dialog preselects the top-ranked day and the top-ranked place (places rank by upvotes). The event page shows the leading days side by side for organizers: who can come, who can't, who hasn't replied.

**Honorees** (`events.honorees`, max 20 member ids) are chosen in Edit. They do not change who may vote; they only add the "can the honoree come?" mark on every day and feed rule 3 above.

## 4.4 Closing and deadline

See [02](02-event-lifecycle.md#voting-window-stage-poll-only). In short: after `voteDeadline` (or **Close voting**) participants cannot change votes; organizers can; the event stays in `poll` until someone locks.

While waiting, a participant's next-step card also shows "Most votes: <day> (<n>)": the first day of `compareDays` (votes, then honorees who can come, then earliest), the same one the lock dialog preselects. It is hidden when no day has a vote, and organizers see their own comparison instead.

## 4.5 Locking

`PATCH { stage:'rsvp', startsAt?, venue?, venueLink? }` by an organizer (`advance`).

The UI sends:

- `startsAt = teamTime(chosenDay, chosenTime)` when the event polls days. The time field defaults to **19:00** (it is not derived from the event type).
- `venue` and `venueLink` copied from the chosen suggested place when the event has no fixed venue and places exist.

The server requires the resulting event to have a `startsAt` (`invalidDate` otherwise) that lies ahead (`startsInPast`), moves the stage, and **derives attendance from votes** in the same batch.

### The plan

```
planFor(pollDays, startsAt, polledVenues, venueName) = {
  day:          teamDay(startsAt)                 if the event polls days and has a startsAt, else null
  venuePolled:  there is at least one suggested place
  venueIds:     ids of suggested places whose name equals the chosen venue name exactly
}
```

### Does a member's vote "fit" the plan? (`matchesPlan`)

| Plan | A member fits when… |
|---|---|
| Day plan, no places polled | their `days` contain the locked day |
| Day plan, places polled | their `days` contain the locked day **and** (they picked no place **or** upvoted the locked place) |
| Place-only plan | they upvoted the locked place |

**If need be is not a fit.** `planFit` returns `yes`, `maybe` or `no`; only `yes` matches. A locked day or place that is in the member's `maybeDays` / `maybeVenueIds` gives `maybe`, and the weaker of the day and the place decides. People who fit only as "if need be" are treated like voters for other days: not seated at lock (asked to confirm), and on a later plan edit a seat derived from their votes is held (`reconfirm`) instead of kept. Someone who picked places (yes or if need be) needs the locked one, so "upvoted A, if need be B" with B locked is `maybe`.

A member who voted only for places on a day plan has no day, so they do not fit; they are asked to confirm instead.

### What lock does to each member (`deriveAttendance`, mode `lock`)

| Member's state at lock | Result |
|---|---|
| Already paid | Untouched |
| Gave an explicit answer (`status` set), including "can't join" | **Untouched.** Answers a member gave themselves are never changed. |
| No answer, votes fit the plan | Becomes `going` with `derived = 'going'`; queue time = `firstVotedAt` (or lock time if missing) |
| No answer, voted but does not fit | Untouched; next-step says **Confirm** ("you voted for other days, are you coming?") |
| Never voted | Untouched; next-step says **Answer** |

Who actually gets a *seat* is then decided on read by the waitlist rule: strict first-come by queue time, `memberId` breaking ties.
See [05](05-rsvp-and-seats.md). The lock dialog previews exactly this (`lockImpact`): it names who is marked Going and who waits, and counts who is asked to confirm.

All derived writes carry the guard "event still in `rsvp` with this date and place, member unpaid, member still unanswered" in SQL, so an answer a member gave a moment earlier always wins and a lost race writes nothing.

## 4.6 Plan changes after the lock

While the event is in `rsvp` and has not started, an organizer may move the date or place (`planMoved`). If the event ever had poll days or suggested places,
attendance is re-derived in mode **`edit`**:

| Member's state | Result |
|---|---|
| Explicit answer (`derived = null`) | Untouched |
| Paid | Untouched |
| Derived and still fits the new plan | Stays `going`, **keeps** their queue spot |
| Derived and no longer fits | **Held**: `derived = 'reconfirm'`, seat kept until the confirm-by deadline |
| Hold already expired | Released (status cleared); never revived by a later edit |

- **Confirm-by deadline** (`events.reconfirmBy`): defaults to `min(now + 48 h, new start)`. The organizer may set another time that is in the future and not after the new start (`invalidDate`).
- A held seat **expires on read**: every seat reader goes through `seated()`, which ignores `reconfirm` rows past the deadline. A cleanup (`releaseExpired`) also clears them when the next plan edit commits.
- The holder **confirms** by answering Going: if the deadline is still ahead and guests did not increase, they keep their queue spot; otherwise they join the back. Declining or silence releases the seat; a later Going joins the back.
- **Entering the bill, completing, or reopening to poll releases all holds** (`releaseHolds`, `clearDerived`).
- An edit never marks anyone who wasn't already counted from votes.
- A fixed-date event that never had a poll has no votes to derive from, so moving its date holds nobody.
- The edit panel previews the effect (`lockImpact` with mode `edit`) before saving.

## 4.7 Hiding results until you vote

`events.hide_votes` (default off, a switch in create and Edit) keeps the poll from anchoring people. While it is on, the event is in `poll` and the visitor is not an organizer and has not voted themselves (`hasVoted`: a day or place picked, yes or if need be, or declined; an RSVP Maybe or an empty row does not count), `GET /api/events/:id` is redacted by `redactVotes` in `shared/utils/event.ts`:

- other members' `days`, `venueIds`, `maybeDays` and `maybeVenueIds` are `[]`, except honorees' days, which stay visible; the visitor's own row is untouched;
- every place's `upvotes` and `maybe` are `[]` and places are ordered by when they were suggested instead of by votes (the order would leak the ranking);
- the response carries `votesHidden: true` and each row's `voted` flag, so the UI can say how many people have answered.

The decision is `hidesVotes`. Organizers always see everything, and the data returns as soon as the visitor votes (declining counts). Known limits: it is a nudge, not secrecy (see [11](11-known-behaviours.md)).

## 4.8 Repeating events

A series is the set of events sharing `events.series_id` (the first event points at itself); `repeat` and `repeat_until` are kept equal on every event of the series. Turning repeat on needs a fixed date, no day poll and a place (`repeatNeedsFixedPlan`), so a series never has a vote to run again.

The tick job `repeat` (`createDueOccurrences` in `server/utils/series.ts`, not gated on email) looks at the **latest event of each series** by `starts_at`, cancelled or not (so cancelling skips only that date). `nextInSeries` in `shared/utils/repeat.ts` gives the next start: +7 days, +14 days, or the same day next month (Vietnam time), clamped to the month's last day while keeping the first event's day of the month (31 Jan, 28 Feb, 31 Mar). It is created once the latest event has started **and** no earlier than 14 days before the next one; an occurrence already in the past is skipped, and one later than `repeat_until` (inclusive) ends the series. At most 10 events per tick.

The new event copies title, note, place, capacity, max guests, hide votes, bank details, cover, theme, honorees, creator, repeat settings and series, starts in `rsvp`, and gets a new join link and a random manage key nobody holds: the signed-in creator gets in as host, and every **active co-host** is copied as an active co-host with a fresh key (they get in through their sign-in). Responses, notice, bill and cancellation are not copied; the creator gets an empty response row. One statement (`INSERT ... ON CONFLICT (series_id, starts_at) DO NOTHING` with the response and co-host rows) makes it atomic and safe for overlapping ticks.

`PATCH` with `repeat` / `repeatUntil` (organizers) writes both to every event of the series in the same batch; `repeat: null` also clears `repeatUntil`. The event page shows "Repeats ... next on ..." and links to the previous and next event (`series` in `GET /api/events/:id`).
