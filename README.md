# Team Events

Plan team events in one place: anyone can create an event, poll dates and venues, collect RSVPs (with guests and a seat limit), then split the bill with a VietQR code per person and track who has paid. The home page lists what needs you (vote, reply, pay), a calendar shows dates and polled days, and each event can have a cover. Vietnamese by default, with an English toggle.

Round 1 (the single birthday-party voter) is in git history at `bbf852a`.

## How it works

- **Who are you?** Everyone picks their name from one shared team list (on the event page, or any time from the sidebar), or taps **I'm new** to add themselves. A similar existing name (Thien / Thiên / THIEN) triggers "Is that you?". There are no passwords: the link is trusted.
- **Events** move through stages:
  1. **Polling**: tap the days you can make, suggest venues and upvote them. The organizer picks the days on a calendar when creating the event.
  2. **RSVP open**: Going / Maybe / Can't, plus guests. With a seat limit, it's strictly first come: a party that doesn't fit waits, and so does everyone after it. Adding guests puts you at the back of the queue.
  3. **Splitting the bill**: the organizer enters the total. Each seat pays `ceil(total / seats / 1000) × 1000` ₫. People see their amount and a VietQR code and tap "I've paid".
  4. **Settled**.

  A **next step** card on each event tells you what to do now (vote, reply, pay), and gives the organizer the one button that moves the event on: lock the date, enter the bill, mark as settled. Confetti marks the big moments (first vote, Going, paid, locked, settled), except with reduced motion.
- **Cover:** pick a gradient or paste an image link (`https://…`). Events without a cover get a gradient based on their id.
- **Organizer:** whoever creates an event gets organizer rights in that browser. **Edit** opens a panel for the title, note, venue, date, seats, bill, bank account and cover, plus "reopen an earlier stage" and delete. **Manage link** copies a secret link that gives another browser or a co-organizer the same rights. Lose it and nobody can manage the event, so keep it somewhere safe.

## Requirements

- Node **24.11 or newer**. On this machine, put `C:\devtools\node-v24.14.1-win-x64` first on `PATH`.
- A Postgres database. A free [Neon](https://neon.tech) project works. Put its connection string in `.env`, which is gitignored:

  ```
  DATABASE_URL=postgresql://…
  ```

## Run locally

```bash
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:3000.

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the waitlist, bill split, next step, name matching, VietQR link, covers and the calendar grid (`node --test`) |
| `npm run typecheck` | Vue and TypeScript type check |
| `npm run db:generate` | Create a migration after changing `server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |

## Deploy (Netlify)

1. Push to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. **Site configuration → Environment variables:** add `DATABASE_URL`.
4. Deploy. `netlify.toml` uses Node 24 and runs `db:migrate` before `nuxt build`, so the schema is always up to date. Nuxt picks the Netlify preset automatically.
5. Optional: turn off deploy previews, since they would migrate the same database.

## Code map

| Piece | Where |
|---|---|
| Shell (sidebar, who-you-are, language, dark mode) | `app/layouts/default.vue` |
| Pages | `app/pages/index.vue` (dashboard), `calendar.vue` (month and agenda), `new.vue` (create), `e/[id].vue` (event) |
| Event blocks | `app/components/EventNextStep.vue` (what to do now), `EventPoll.vue`, `EventRsvp.vue`, `EventBill.vue`, `EventEdit.vue` (organizer panel), `EventCard.vue`, `CoverPicker.vue`, `PollDaysInput.vue` |
| API | `server/api/members.*`, `server/api/events/**` |
| Schema and migrations | `server/db/schema.ts`, `server/db/migrations/` |
| Waitlist, split, next step, name match, VietQR | `shared/utils/event.ts` (tested in `test/event.test.ts`) |
| Confetti | `app/utils/confetti.ts` |
| Cover presets | `shared/utils/cover.ts` |
| Strings | `i18n/locales/vi.json`, `en.json` |

Each member writes only their own row per event (`responses`), and the waitlist and totals are computed when the event is read, so concurrent RSVPs can't corrupt the queue. Times are shown and entered in Vietnam time (UTC+7).

## Design

The UI is a dashboard built with Nuxt UI's dashboard components:

- a collapsible sidebar, which becomes a slide-over on phones
- colors from the app icon: indigo brand, amber for "celebrate" moments (top pick, paid, settled), neutral zinc surfaces, and the Inter font. The icon (`public/app-icon.png`) is cut into `favicon.png`, `apple-touch-icon.png` and `icon-512.png` (share image)
- light and dark mode (toggle in the sidebar)
- a "needs you" list and event cards with your own status on the home page, and a hero header, stage stepper and next-step card on each event

It respects `prefers-reduced-motion` and `prefers-contrast`. Tokens live in `app/assets/css/main.css`, and component defaults in `app/app.config.ts`.

## Known quirk

`package.json` pins `flat-cache` to 6.1.23 through `overrides`. Version 6.1.24 depends on `cacheable@^2.5.1`, which was never published. Drop the override once a fixed `flat-cache` is released.
