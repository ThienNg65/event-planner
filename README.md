# Team Events

Plan team events in one place: anyone can create an event (private: only people with its joining link can see and join it, and the home page lists only your events), poll dates and venues, collect RSVPs (with guests and a seat limit), then split the bill with a VietQR code per person and track who has paid. The home page lists what needs you (vote, reply, pay), a calendar shows dates and polled days, and each event can have a cover. Vietnamese by default, with an English toggle.

Round 1 (the single birthday-party voter) is in git history at `bbf852a`.

## How it works

- **Who are you?** The first time, you tap **I'm new**, enter your name and choose a **6-digit PIN** (no 111111 or 123456), or pick your name from the team list if it was added before you ever signed in and choose a PIN for it (each name can be claimed once). A similar existing name (Thien / Thiên / THIEN) triggers "Is that you?". The browser then remembers you in a secure session cookie: there is no name switcher. To be you on another phone or computer, pick your name and enter your PIN there. After 5 wrong PINs the name is locked for 15 minutes. If you forget it, an organizer resets it in **Tidy the team list** and gives you the new one. People who signed in before PINs existed set theirs from the sidebar (**Set a PIN**). The older **sign-in link** (`/#signin=…`, copy it from the sidebar; it works like a password) still works; if it leaks, or you lose a phone, **Sign out other devices** (sidebar, after a confirm) ends every other session and the old link, and keeps this one in. Right after creating an event, a creator with no PIN is offered to set one (or to save the sign-in link, with a warning to keep it private). **Sign out** (sidebar, after a confirm) forgets you in this browser only, together with any manage or co-host links opened on it; your PIN and sign-in link keep working. Anyone who has created an event can **tidy the team list** (sidebar): archived people leave the name list and the "no reply yet" counts, and come back when they sign in again. Nobody is deleted.
- **Events** move through stages:
  1. **Polling**: tap the days you can make (or mark a day **If need be** when you could come but would rather not), suggest venues and upvote them (also with **If need be**), or say **Can't join** up front (this withdraws your votes, so locking never marks you Going, and you drop off the "no reply yet" list; voting again takes it back). The organizer picks the days on a calendar when creating the event.
  2. **RSVP open**: Going / Maybe / Can't, plus guests (both save as you tap). With a seat limit, it's strictly first come: a party that doesn't fit waits, and so does everyone after it. Adding guests puts you at the back of the queue. The organizer can limit how many guests each person may bring (up to 10).
  3. **Splitting the bill**: once the event has started, the organizer enters the total. Each seat pays `ceil(total / seats / 1000) × 1000` ₫. People with a seat see their amount and a VietQR code and tap "I've paid".
  4. **Settled**.

  The organizer can turn on **hide results until you vote**: during the poll, people see the day and place results only after picking their own (organizers always see them). **Duplicate** (organizer button on the event page) opens the create form prefilled from an earlier event, without dates or answers. **Repeat** (weekly, every 2 weeks or monthly, optionally until a date) creates the next event automatically once the previous one has started; it needs a fixed date and place.

  **Honorees** (who the event is for, e.g. birthday people) are picked in Edit; every proposed day shows whether each can come. Organizers also see the leading days side by side (who can come, who can't, who hasn't replied). When days tie on votes, the day more honorees can make is suggested, then the earlier one; the lock dialog preselects it and says why. Once everyone has replied, organizers are nudged to lock.

  A **next step** card on each event tells you what to do now (vote, reply, pay), and gives the organizer the one button that moves the event on: lock the date, enter the bill, mark as settled. Confetti marks the big moments (first vote, Going, paid, locked, settled), except with reduced motion.
- **Cover:** pick a gradient or paste an image link (`https://…`). Events without a cover get a gradient based on their id.
- **Roles:** the **host** (the member who created the event, or anyone holding its manage key) can do everything. Organizers see their controls whenever they are signed in as themselves; the manage link is only needed on a device where they are not. A **co-host** is invited by name: the host picks a team member in Organizers and sends them a single-use invite link (`/e/:id#invite=…`; the fragment never reaches a server). Accepting it (signed in as that member) makes them a co-host on every device they sign in on, and also stores an access key in that browser; the link is then dead, an unaccepted one expires after 7 days, at most 5 co-hosts (active + pending) per event. The host can re-issue access (cuts the current access) or revoke, and a co-host can leave. The older shared co-host link still works until revoked but can no longer be created. The host (signed in as themselves) can **hand the event over** to an active co-host with a PIN from the host menu; when they accept, they become the host with a new manage link and the old host stays a co-host. A co-host can edit, remove places, lock, bill and settle, but not reopen an earlier stage, cancel, delete or manage the co-host link. Everyone else is a **participant**: they can only vote, suggest, RSVP and report payment for themselves (the server checks the session cookie), while that step is open. A name is only as safe as its PIN and sign-in link: whoever knows or holds them acts as that member. Names added before sign-in existed can be claimed (with a PIN) by whoever picks them first, except a name that created an event (that would hand over its host rights): its owner signs in with their PIN, sign-in link or manage link, and no other organizer can reset it. The create page only asks for a new name, so it never lists other people.
- **Lifecycle:** Voting → Confirmed → Paying → Completed (stages `poll`, `rsvp`, `bill`, `settled`). **Cancelled** is an overlay, so restoring returns to the same stage. Voting can have a deadline; after it only organizers change votes. Organizers can **close voting** now (the deadline becomes now) and **reopen** it with no deadline or a new one; votes are never touched by either. Reopening an earlier stage to Voting can do the same, and clears the locked date of a day poll. Stages move forward one at a time. A start time must lie ahead when an event is created with a fixed date, when it is locked and when the date is moved; only **Correct date or place** can set a past time. Participants can suggest days and places (duplicates add your vote).
- **Votes count as attendance.** When the organizer locks the plan, everyone whose votes fit the chosen day (and place) is marked **Going** from their votes, queued by when they first voted (editing votes never moves them; ties go to the lower member id). If places were polled too, a member who upvoted places needs the locked one; someone who voted only for places is asked to confirm instead. A day or place marked **If need be** does not count as a fit: those people are asked to confirm, not marked Going. Answers the member gave themselves are never changed. The lock dialog previews who gets marked and who waits.
- **Plan changes hold seats.** Before the event starts, moving the date or place keeps matching members as they are and **holds** the seat (or place in line) of those it no longer fits until a *confirm-by* deadline (default 48 h, never after the new start). Confirming in time keeps their priority; declining or missing the deadline releases it, and a later Going joins the back. An edit never marks anyone who wasn't already counted from their votes, and holds that already expired are not revived. Entering the bill or completing releases any remaining holds.
- **Frozen plan.** Once the event has started or the bill is entered, Edit can't change the date or place. The host or a co-host uses **Correct date or place**, which needs a public notice and never touches attendance or payments.
- **Completed** is not the same as *all paid*. An event with no bill can be completed after it has started (after a confirm), and the host or a co-host can complete with debts still open (the debtors are listed first). Members who still owe can keep reporting payments after Completed; only organizers set or clear amounts. Reopening to Voting clears unpaid derived answers, and with recorded payments the host must acknowledge that they stay.
- **Payments** can be partial: a member reports what they transferred, the QR is for what is left, and organizers can correct anyone in the People list. After Completed, participants can only add a payment, not change amounts.
- **Editing** is split by how a change takes effect. **Edit** opens a panel for the details (saved with Save, previews what a seat-limit, place or bill change does to people first). **Post an update** publishes a notice at once. **Organizers** shows your role, what each role may do, and (host only) the manage link (`/e/:id#key=…`), a button to make a new one (the old link stops working) and the co-host link. The host-only **⋯** menu holds reopen an earlier stage, cancel/restore and delete, each behind its own confirm. Creating an event opens a **share** dialog with a ready message in Vietnamese or English (a toggle, independent of the app language) to paste into Zalo, plus the link, QR and share sheet. Organizers also get a **reminder** card listing who has not voted, answered or paid, with a message to copy (a payment reminder names people or only counts them, and never shows amounts). Events with a date offer **Add to calendar** (a calendar file or Google Calendar, 2 hours). After voting closes, participants see the day with the most votes. The bill is entered from the next step; the panel only corrects it once the cost is being split.

## Documentation

How the app works in depth (event lifecycle, identity and roles, polling, seats and waitlist, bill and payments, data model, API, known behaviours) is in [`docs/`](docs/README.md). Start there if you are new to the codebase.

## Requirements

- Node **24.11 or newer**. On this machine, put `C:\devtools\node-v24.14.1-win-x64` first on `PATH`.
- A Postgres database. A free [Neon](https://neon.tech) project works. Put its connection string in `.env`, which is gitignored:

  ```
  DATABASE_URL=postgresql://…
  ```

## Run locally

```bash
npm install
npm run db:migrate   # run again after pulling: migration 0002 adds roles, deadline, cancel, notice and partial payments
npm run dev
```

Open http://localhost:3000.

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the waitlist, bill split, next step, name matching, VietQR link, covers, the calendar grid and email codes, tokens and limits (`node --test`) |
| `npm run typecheck` | Vue and TypeScript type check |
| `npm run test:api` | Builds the app, migrates the database, starts it on port 3999 and runs the API tests in `test/api` against `DATABASE_URL` (or `TEST_DATABASE_URL`). Test data is named `zz-test-` and events are deleted after each test |
| `npm run db:generate` | Create a migration after changing `server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |

## Email (optional, off by default)

Members can add a verified email to reset their own forgotten PIN and to get event emails: the date or place is set or changed, a payment is requested (their own amount and a VietQR link) or recorded by the organizer, or the event is cancelled. Each mail has a "stop these emails" link and each kind can be switched off in the profile. Email stays switched off, and its screens hidden, until you configure [Resend](https://resend.com). Copy `.env.example` for the list; set these as environment variables on the host (on Cloudflare as Worker variables/secrets):

| Variable | Meaning |
|---|---|
| `RESEND_API_KEY` | Resend API key; unset keeps email off |
| `MAIL_FROM` | Sender on a domain verified in Resend, e.g. `Team Events <events@example.com>` |
| `APP_URL` | Public address of the site, used in links inside mails |
| `NOTIFY_SECRET` | Long random string that signs mail links and keys the one-time codes |
| `ALLOWED_EMAIL_DOMAINS` | Optional comma-separated work domains; empty allows any |

Members consent when they add an address (the text names Resend as a processor outside Vietnam) and can withdraw by removing it. How it works: [docs/13-email.md](docs/13-email.md).

## Scheduled tick (hourly)

Time-based work runs from an hourly tick that needs no database setup. It is protected by a shared secret.

| Variable | Meaning |
|---|---|
| `CRON_SECRET` | Long random string. Required for the tick to run over HTTP (Netlify); unset makes `POST /api/cron/tick` answer 404 |
| `APP_URL` | Netlify only: the function calls `APP_URL/api/cron/tick` |

Netlify runs `netlify/functions/tick.mts` every hour. Cloudflare gets the cron trigger `0 * * * *` from the generated Wrangler config; if you manage triggers in the dashboard instead, add it under the Worker's **Settings, Triggers, Cron Triggers**. Details: [docs/12-development-guide.md](docs/12-development-guide.md#scheduled-tick).

## Deploy (Netlify)

1. Push to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. **Site configuration → Environment variables:** add `DATABASE_URL`.
4. Deploy. `netlify.toml` uses Node 24 and runs `db:migrate` before `nuxt build`, so the schema is always up to date. Nuxt picks the Netlify preset automatically.
5. Optional: turn off deploy previews, since they would migrate the same database.

## Deploy (Cloudflare Workers)

1. Cloudflare → **Workers & Pages → Create → Import a repository** → pick the repo.
2. **Build command:** `npm run db:migrate && npm run build` (the build alone does not migrate). **Deploy command:** `npx wrangler deploy` (the default).
3. Add `DATABASE_URL` both as a **build variable** (for the migration) and as a **variable/secret** of the Worker (for the app).
4. Deploy. Nuxt picks the `cloudflare-module` preset automatically and writes the Wrangler config (with `nodejs_compat`); the Worker name comes from the Git repo, e.g. `lhtuwrk-event-planner`.

## Code map

| Piece | Where |
|---|---|
| Shell (sidebar, who-you-are, language, dark mode) | `app/layouts/default.vue` |
| Pages | `app/pages/index.vue` (dashboard), `calendar.vue` (month and agenda), `new.vue` (create), `e/[id].vue` (event) |
| Event blocks | `app/components/EventNextStep.vue` (what to do now), `EventPoll.vue`, `EventRsvp.vue`, `EventBill.vue`, `EventEdit.vue` (details panel), `EventHostMenu.vue` (reopen, cancel, delete), `EventCorrectDialog.vue` (correct date or place), `EventOverview.vue`, `EventSeries.vue` and `EventOrganizers.vue` (the status rail), `EventOrganizersDialog.vue` (roles, manage and co-host links), `EventCard.vue`, `CoverPicker.vue`, `PollDaysInput.vue` |
| API | `server/api/members.*`, `server/api/events/**` (roles in `server/utils/http.ts`; bulk attendance writes in `server/utils/attendance.ts`) |
| Schema and migrations | `server/db/schema.ts`, `server/db/migrations/` |
| Waitlist, split, payments, voting window, attendance from votes (`matchesPlan`, `deriveAttendance`, `seated`), frozen plan, next step, name match, VietQR | `shared/utils/event.ts` (tested in `test/event.test.ts`) |
| Message texts for sharing and reminders | `app/utils/messages.ts` (tested in `test/messages.test.ts`) |
| Calendar file and Google Calendar link | `shared/utils/ics.ts` (tested in `test/ics.test.ts`) |
| Roles and permissions table (`can()`) | `shared/utils/roles.ts` |
| Email: addresses, one-time codes, mail sending and templates | `server/utils/mail.ts`, `emailCodes.ts`, `mailCrypto.ts`, `mailTemplates.ts`, `shared/utils/email.ts` (tested in `test/email.test.ts`) |
| Event emails: outbox, dispatch, unsubscribe, who gets what | `server/utils/outbox.ts`, `unsubscribe.ts`, `server/api/unsubscribe.*`, `shared/utils/notify.ts` (tested in `test/notify.test.ts`) |
| Confetti | `app/utils/confetti.ts` |
| Cover presets | `shared/utils/cover.ts` |
| Strings | `i18n/locales/vi.json`, `en.json` |

Each member writes only their own row per event (`responses`), and the waitlist and totals are computed when the event is read, so concurrent RSVPs can't corrupt the queue. Times are shown and entered in Vietnam time (UTC+7).

## Design

The UI is a dashboard built with Nuxt UI's dashboard components:

- a collapsible sidebar, which becomes a slide-over on phones
- colors from the logo: indigo brand, amber for "celebrate" moments (top pick, paid, settled), neutral zinc surfaces, and the Inter font. The logo is two overlapping circles (the overlap is the day everyone agrees): `public/logo.svg` is the master; `favicon.svg`, `favicon.png`, `apple-touch-icon.png` (full-bleed, iOS rounds it), `icon-512.png` (fallback share image) and `app-icon.png` are exports of it.
- light and dark mode (toggle in the sidebar)
- a "needs you" list and event cards with your own status on the home page, and on each event a header with the key facts, a next-step card and only the section for the current stage

It respects `prefers-reduced-motion` and `prefers-contrast`. Tokens live in `app/assets/css/main.css`, and component defaults in `app/app.config.ts`.

## Known quirk

`package.json` pins `flat-cache` to 6.1.23 through `overrides`. Version 6.1.24 depends on `cacheable@^2.5.1`, which was never published. Drop the override once a fixed `flat-cache` is released.
