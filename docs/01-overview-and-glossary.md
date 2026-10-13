# 1. Overview and glossary

## What the app is

Team Events lets a small team plan an outing end to end in one place:

1. **Decide** when and where: the organizer proposes days (and optionally lets people suggest places); people tap the days they can make.
2. **Commit**: once the plan is locked, people who voted for it are counted as Going; others answer Going / Maybe / Can't. A seat limit turns late "Going" answers into a waiting list.
3. **Pay**: after the event, the organizer enters the bill; it is split per seat and each person sees their amount and a VietQR code.
4. **Close**: the organizer completes the event; people who still owe can keep reporting payments.

The stack is Nuxt 4 + Nuxt UI, Nitro server routes, Postgres (Neon over HTTP) through Drizzle, deployed on Netlify. UI text is Vietnamese by default with an English toggle.

## Who uses it

| Persona | What they do |
|---|---|
| **Host** | Creates the event, holds its manage key. Can do everything, including reopen, cancel, delete and managing co-hosts. |
| **Co-host** | Invited by name (or via a legacy shared key). Can edit, lock, enter the bill, complete and fix other people's answers, but not reopen, cancel, delete or manage co-hosts. |
| **Participant** | Any team member. Votes, suggests days and places, answers RSVP, reports their own payment, only while that step is open. |
| **Visitor (not signed in)** | Can browse every event; cannot write anything until they say who they are. |

The app is **team-internal and public inside the team**: every event is visible to everyone who opens the site, and the roster is every member that ever signed in or was added, minus the archived ones ([03](03-identity-and-roles.md#archived-members)). There is no per-event privacy.

## Glossary

| Term | Meaning |
|---|---|
| **Member** | A named person on the team roster (`members`). A name is unique. A member is "claimed" once someone has signed in as them. |
| **Event** | One planned outing (`events`). Has a title, a plan (date and place), a seat limit, a bill, a stage. |
| **Stage** | `poll → rsvp → bill → settled`. UI labels: Voting → Confirmed → Paying → Completed. |
| **Cancelled** | An overlay on any stage (`cancelledAt`), not a stage. Restoring returns to the same stage. |
| **Poll day** | A candidate date (`YYYY-MM-DD`, a calendar day with no time). An event with poll days has no `startsAt` until it is locked. |
| **Fixed-date event** | Created with a date and time instead of poll days; has no day poll. |
| **Venue / place** | A named place. Either fixed on the event (`events.venue`) or collected as suggestions (`venues`) that people upvote. |
| **Lock** | The organizer's move from `poll` to `rsvp`: picks the day (and place), freezes the vote and marks attendance from votes. |
| **Vote** | A member's chosen days and upvoted places (`responses.days`, `responses.venueIds`). |
| **Honoree** | A member the event is for (birthday person). The poll shows whether each honoree can make each day. |
| **Status** | A member's own RSVP answer: `going`, `maybe`, `no`. |
| **Derived attendance** | A `going` answer the member did not give: `derived = 'going'` (counted from their votes at lock) or `'reconfirm'` (seat held after a plan change). |
| **Hold / reconfirm** | After the date or place moves, a seat whose owner's votes no longer fit is *held* until a confirm-by deadline; confirming keeps the queue spot, missing it releases the seat. |
| **Seat** | One place at the event. A Going member takes `1 + guests` seats. |
| **Capacity** | The seat limit (`events.capacity`); null means unlimited. |
| **Waitlist** | Going members who do not fit, in queue order. First come, strictly. |
| **Guest** | A plus-one a member brings (0 to 10). Takes a seat and shares the bill. |
| **Share** | Per-seat amount: `ceil(billTotal / seats / 1000) × 1000` VND. |
| **Manage key** | A random secret for an event, stored hashed on the server and in the host's browser `localStorage`. Sent as the `x-manage-key` header. |
| **Sign-in link** | `/#signin=<token>`: opens the app as a specific member on another device. Works like a password. |
| **Notice** | A short public announcement the organizer posts on an event (max 280 chars). |
| **Correction** | A date or place change after the plan is frozen; needs a public notice and never touches attendance or payments. |
| **Team time** | Asia/Ho_Chi_Minh, UTC+7, no daylight saving. All times are entered and shown in it. |

## What the app deliberately does not have

- No passwords, no email, no push notifications or reminders. Everything is pull-based; the home page lists what needs you.
- No per-event privacy or invitations: the roster is the audience.
- No member deletion in the product (only the API tests' cleanup removes members).
- No payment processing: VietQR is an image link; "paid" is self- or organizer-reported.
