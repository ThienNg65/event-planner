# 6. Bill and payments

After the event starts the organizer can enter the bill (`rsvp → bill`). The total is split across confirmed seats, each person sees what they owe,
and payments are reported by the payer or corrected by an organizer. The app never moves money; "paid" is a recorded claim and VietQR is an image link.
Code: `shareOf`, `paymentOf`, `allPaid`, `vietqrUrl` in `shared/utils/event.ts`; writes in `response.put.ts`; UI in `EventBill.vue`, `EventNextStep.vue`, `EventPeople.vue`.

## 6.1 Entering the bill

`PATCH { stage:'bill', billTotal, bankId?, bankAccount?, bankHolder? }` by an organizer.

| Field | Rule |
|---|---|
| `billTotal` | Integer VND, 0 to 1,000,000,000 (`invalidBill`) |
| `bankId` | Bank code for VietQR, 2 to 20 letters/digits (e.g. `VCB`) (`invalidBank`) |
| `bankAccount` | 1 to 19 letters/digits (`invalidBank`) |
| `bankHolder` | Free text, max 50 |

The bank fields are optional. They can also be set when creating the event (the create page remembers the last bank details in the browser under `te:bank`) or in Edit.
Entering the bill releases any seat still being held ([04](04-polling-and-locking.md#plan-changes-after-the-lock)) and freezes the plan.
The move needs the event to have started (`notStarted` before that), and the UI offers "Enter bill" only then.
Without a bill, a started event can be completed straight from `rsvp` ("Complete, no bill").

### Attendance check ("Who actually came?")

The Enter bill dialog lists every member with a response row, confirmed first, pre-ticked with today's confirmed seats and their guests. The organizer ticks walk-ins (Maybe, Can't, no answer, waitlisted) with their guests and unticks people who didn't come. The dialog previews seats and the per-seat share. The UI always sends `attended: [{ memberId, guests }]` with the move; the field is optional, and without it the move works as before.
`attendanceCheck` in `shared/utils/event.ts` decides, and `checkInWrites` in `server/utils/attendance.ts` writes, in the same batch:

| Member | Becomes |
|---|---|
| Ticked | `going` with the given guests, explicit (`derived = null`). Someone already going with as many guests keeps their queue spot |
| Unticked, had a seat (confirmed) | `no` with `no_show = true`: People shows "Said going, didn't come" |
| Unticked, waitlisted or a lapsed hold | `no` (no flag: they never had a seat) |
| Paid (any payment recorded) | Untouched, but their seats still count |

If the ticked seats exceed the seat limit, `capacity` is raised to fit them and the first original is kept in `planned_capacity` (`COALESCE`, so a second check after a reopen keeps it). Everyone who came is therefore confirmed and owes a share. Seat counts then read `15/10 + 5` in red with an info tooltip (`SeatCount.vue`, `overLimit`).
The flag goes away on any later status write (an organizer can still move a no-show to Going in the People list), and reopening to the poll turns no-shows back into "no answer".
Not covered: free events completed without a bill, and people who never joined the event (they open the joining link first, or count as someone's guests).

## 6.2 The split

```
seats = sum over confirmed parties of (1 + guests)
share = ceil(billTotal / seats / 1000) * 1000        (null if no bill or no seats)
owes(member) = share * (1 + member.guests)           (only confirmed members owe)
```

- Rounding is **up to the next 1,000 VND** per seat, so the amount collected can exceed the bill by up to 999 VND per seat (a 100,000 ₫ bill over 3 seats is 34,000 ₫ each, 102,000 ₫ collectable). The page states the rounding.
- Only **confirmed** attendees owe. Waitlisted, Maybe and Can't members, and held seats that lapsed, owe nothing. The attendance check (above) settles who owes when the bill is entered. Afterwards an organizer can still move a Maybe to Going during the bill stage (People list); that person then owes a share and everyone else's share drops.
- The share is computed on read from the current seat count; it is not stored. If seats change after the bill (an organizer edits someone's RSVP or guests), everyone's amount moves accordingly.
- **Preview payment** (organizers, stage `rsvp`, before the event starts): `EventNextStep.vue` opens a read-only modal where a throwaway total is split over today's confirmed seats with `shareOf`. Nothing is saved and the stage does not change.

## 6.3 Recording payments

A member's `responses` row holds `paidAt` and `paidAmount`.

```
paid(member) = paidAmount            if paidAmount is not null
             = owes                  if paidAt is set and paidAmount is null   (legacy / "paid in full" rows)
             = 0                     otherwise
left  = max(0, owes - paid)          (an overpayment leaves nothing)
done  = left == 0
```

`PUT /api/events/:id/response` accepts exactly one of these payment forms:

| Body | Effect | Notes |
|---|---|---|
| `{ paid: true }` | `paidAmount = null`, `paidAt = now` | "Paid in full". Stays full if the bill or guests change later. |
| `{ addPaid: n }` | `paidAmount += n`, `paidAt = now` | The participant's normal action: the form starts at what is left, so one tap confirms. It is an **increment**, so it never overwrites a correction made since the page loaded. `n` is an integer from 1 to 1,000,000,000. |
| `{ paidAmount: n \| null }` | Sets the exact amount; `0` or `null` clears both fields | Organizer correction ("set amount", "mark unpaid"). |

Who may use them:

| | Stage `bill` | Stage `settled` (Completed) |
|---|---|---|
| Participant, own row | `paid`, `paidAmount`, `addPaid` | `addPaid` only |
| Organizer, any row | all three | all three |

A participant may report a payment only while holding a seat (confirmed in `rollCall(seated(...))`); otherwise `notAttending` (409). Organizers may record anyone.
The server does **not** check the amount against what is owed: an overpayment is accepted and clamped on read (`left = 0`).

## 6.4 VietQR

`vietqrUrl(bankId, account, holder, amount, note)` builds `https://img.vietqr.io/image/<bank>-<account>-compact2.png?amount=…&addInfo=…&accountName=…`.

- `amount` is what the member still owes (`left`), so the QR is for the remainder after a partial payment.
- `addInfo` is `"<event title> <member name>"` stripped to ASCII letters/digits and spaces (via `norm`) and cut to 50 characters (the bank limit).
- The QR is shown only when the event has both `bankId` and `bankAccount` and the member is not yet done. Otherwise the page says the organizer has not entered a bank account and to pay directly.
- If the image fails to load the component falls back (`qrFailed`).
- Organizers can check the bank fields before anyone pays: the bank inputs (create page, Edit, Enter bill) have a **Preview QR** button (`BankQrPreview.vue`) that shows an open-amount code (amount 0) or an error if VietQR rejects the bank code or account. VietQR prints the holder name it is given; it does not verify it against the bank, so scanning the preview in a banking app is the real check.

## 6.5 Settling and "Completed"

`allPaid(confirmed, share)` is true when there is a share, at least one confirmed party, and every confirmed party is done. It turns the organizer's main button into **Mark as settled**.

- **Completed does not mean all paid.** Organizers can complete with debts open (**Complete with open debts**). The UI shows a confirm dialog listing debtors first (`owing`); the server does not require it.
- After Completed, members who still owe can keep reporting payments (`addPaid`); only organizers set or clear amounts. The page headline reads "Completed, some payments outstanding" until the last debt is paid, then "All settled".
- A free event (no bill) completes from `rsvp` once started.
- Reopening to `poll` with any recorded payment requires `acknowledgePayments:true`; payments are never deleted by a reopen.
- Frozen plan: once the bill is entered, date and place change only through a notice-backed correction.

## 6.6 Edge cases to keep in mind

- `billTotal` 0 gives a share of 0: everyone is `done` immediately and the event can be completed.
- A bill entered while zero seats are confirmed gives `share = null` ("bill pending").
- Changing guests or seats after payments exist changes `owes`; a `paidAmount` row is then compared with the new amount (it may become partially paid or overpaid), while a "paid in full" row (`paidAmount = null`) stays done.
- Amounts are integers everywhere; never introduce decimals.
