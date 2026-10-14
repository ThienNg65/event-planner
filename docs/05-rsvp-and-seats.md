# 5. RSVP and seats

After the lock (stage `rsvp`) people answer **Going / Maybe / Can't**, optionally with guests. A seat limit turns late "Going" answers into a waiting list.
Code: `rollCall`, `seated`, `capacityImpact` in `shared/utils/event.ts`; the write path is `server/api/events/[id]/response.put.ts`.

## 5.1 Answers

Stored on the member's `responses` row:

| Column | Meaning |
|---|---|
| `status` | `going`, `maybe`, `no`, or `null` (no answer) |
| `guests` | 0 to 10 extra people the member brings (`invalidGuests`); only meaningful when going (the UI sends 0 for maybe/no) |
| `derived` | `null` = the member's own answer; `'going'` = counted from their votes; `'reconfirm'` = seat held after a plan change |
| `goingAt` | Queue timestamp; set when the member becomes Going or adds guests |

A DB check ties them: `derived` may only be set while `status = 'going'`.

Any answer a member gives themselves clears `derived` (it becomes an explicit answer). Only **Going** takes seats. Maybe and Can't take none.

In the UI every answer saves at once: the status buttons on tap, the guest count on its own 600 ms after the last change while the member is Going (`EventRsvp.vue`; there is no Update button).

Who may write what and when: participants write their own row while the stage is `rsvp` (organizers: any stage, anyone's row). The server does **not** check "started"; after the start time the UI simply stops prompting (`nextStep` returns `done`).

## 5.2 Seats and the waitlist (`rollCall`)

Input: all `going` rows that survive `seated()`, plus the capacity.

1. Take rows with `status = 'going'` and a `goingAt`, ordered by `goingAt`, ties by `memberId`.
2. Walk the queue keeping a seat count. A party needs `1 + guests` seats.
3. While no one is waiting and the party **fits** (`capacity` is null or `seats + 1 + guests ≤ capacity`), they are **confirmed**.
4. **Strict first-come**: the first party that does not fit goes to the waitlist, and **everyone after it waits too**, even a single person who would still fit.

Consequence: a party that does not fit blocks smaller parties behind it. Example, capacity 4, in queue order: A alone takes 1 seat (1 used); B with 3 guests needs 4 and does not fit, so B waits; C alone would fit in the 3 free seats but waits too, because B is ahead. If B leaves or shrinks, B and then C are promoted in order.

`seated(rows, ev)` first removes held seats whose confirm-by deadline has passed. It is the single filter every reader uses (event page, home list), so an expired hold never counts.

### Queue position rules (`goingAt` in the upsert)

When a member writes `status`:

| Situation | `goingAt` |
|---|---|
| Answers Going and was not Going before | now (back of the queue) |
| Already Going, guests increased | now (**adding guests sends you to the back**) |
| Already Going, same or fewer guests | unchanged (keeps the spot) |
| Held seat (`reconfirm`), deadline still ahead, guests not increased | unchanged (confirming keeps priority) |
| Held seat, deadline passed or guests increased | now |
| Answers Maybe / Can't / clears | `null` |

Seat counts, the waitlist and the per-seat share are **computed on read** and never stored. Do not add stored counters (see [10](10-concurrency-and-invariants.md)).

## 5.3 Changing the seat limit

Editing `capacity` writes nothing to responses. Because the queue is recomputed on read, a lower limit pushes the tail of the confirmed list onto the waitlist,
and a higher limit promotes the head of the waitlist. `capacityImpact(responses, from, to)` returns `{ waitlisted, promoted }` and the edit panel shows it before saving.
Valid range: 1 to 500 or unlimited (`invalidCapacity`).

## 5.4 What the page shows per person (People list)

People join through the joining link (`/e/:id?join=<key>`, shown in Share). "No reply yet", the voted/total count and the avatar strip use the participants (`participants` in the event response), not the whole team.

`EventPeople.vue` ranks rows `going → waitlist → maybe → voted → no`, then by name. In the poll stage a row appears for anyone with a vote or "can't join".

A row's `kind`:

- `going`: confirmed (has a seat)
- `waitlist`: Going but waiting; shows the place number (#1, #2…)
- `maybe`, `no`: the member's answer
- `voted`: counted from votes without an answer, or a held seat that has lapsed

Organizers (`setOthers`) get a menu per row: set Going / Maybe / Can't (stage `rsvp`) and, while paying, mark paid / set amount / mark unpaid.

## 5.5 Home-list counters

`GET /api/events` returns, per event, `seats`, `answered`, `allPaid`, `manager` and the visitor's own `mine` state (`mineOf`):
whether they voted, their status, whether their seat is held or waitlisted, what they owe and have paid. It reuses `rollCall` and `seated`, so the list and the event page can never disagree.
