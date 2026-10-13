# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Team Events: a Nuxt 4 + Nuxt UI app for planning team events (date/venue polls, RSVPs with a seat limit, bill split with VietQR, payment tracking). Postgres (Neon) via Drizzle, deployed on Netlify. UI is Vietnamese by default with an English toggle. `README.md` has the product rules in detail; read it before changing behaviour.

Note: `C:\toys\CLAUDE.md` (parent folder) holds Java/banking rules for a different project. They do not apply here (no Java, no checkstyle, no `cb`).

## Commands

Node >= 24.11 is required. On this machine put `C:\devtools\node-v24.14.1-win-x64` first on `PATH`. `DATABASE_URL` must be in `.env` (gitignored).

```bash
npm install
npm run db:migrate     # apply server/db/migrations to DATABASE_URL
npm run dev            # http://localhost:3000 (preview config: .claude/launch.json "nuxt-dev")
npm test               # node --test test/*.test.ts (native TS, no runner or transpile step)
npm run typecheck      # nuxt typecheck (vue-tsc)
npm run db:generate    # after editing server/db/schema.ts; commit the generated SQL + meta snapshot
```

Single test: `node --test --test-name-pattern="strict first-come" test/event.test.ts`

There is no linter. `netlify.toml` runs `db:migrate` before `nuxt build`, so a pushed migration reaches the production database on deploy.

## Architecture

- **Shared pure logic lives in `shared/utils/`** and is imported by both the Nitro server and the Vue app (and by the tests, which import with explicit `.ts` extensions). `event.ts` has the waitlist (`rollCall`), bill split, payments, voting window, `mineOf` and `nextStep`. `roles.ts` has the `can(role, action)` permission table. Put any rule the server and UI must agree on here, and unit-test it in `test/event.test.ts`.
- **Server** (`server/api/events/**`, `members.*`) uses Nitro auto-imports. `server/utils/db.ts` has `useDb()` (Neon HTTP driver, so no interactive transactions), `findEvent`, `requireMember`. `http.ts` has `fail`, `roleOf`, `requireSelf`, `requireCan`, `requireVoting`, `readJson`. `eventFields.ts` is the single validator for create and PATCH bodies.
- **Concurrency model:** each member writes only their own `responses` row per event. The waitlist, seat count and per-seat share are computed on read in `[id].get.ts` (not stored), so concurrent RSVPs cannot corrupt the queue. Keep it that way: do not add stored counters.
  - The only bulk writes to other members' rows are the lock, plan-edit, reopen-to-poll and bill/complete batches in `[id].patch.ts` (statements in `server/utils/attendance.ts`, always batched with the event UPDATE and guarded so an explicit or paid row is never changed). Held seats (`derived = 'reconfirm'`) expire on read: every seat reader goes through `seated()`, and `releaseExpired` must run before `reconfirm_by` is rewritten.
- **Auth has no password by design.**
  - Identity is a random token in the httpOnly `sid` cookie; only its sha256 is stored (`members.tokenHash`). `meOf` resolves it (once per request), `requireSelf` checks it. `POST /api/members` and `/api/members/:id/claim` (only while `tokenHash` is null) set it; `/api/me/link` + `/api/me/signin` move it to another device via `/#signin=<token>`.
  - `roleOf` grants host to the signed-in creator or the `x-manage-key` header matching `events.manageKeyHash`, and co-host to an active `cohosts` row for the signed-in member, its access key, or the legacy `coHostKeyHash`.
  - The browser keeps keys in localStorage (`app/composables/useManageKey.ts`) and `useEventApi` attaches the header. A `?key=` URL param is stored then stripped, and the higher-ranked key wins.
  - Check permissions through `can()`/`requireCan`, never ad hoc role comparisons.
- **Event lifecycle:** `stage` is `poll → rsvp → bill → settled`. Cancelled is an overlay (`cancelledAt`), not a stage, so restoring returns to the same stage.
- **Frontend:** `app/pages/e/[id].vue` is the event page. It shows one stage component (`EventPoll`, `EventRsvp`, `EventBill`) plus `EventNextStep` and the organizer panel `EventEdit`. `EventDetail` (in `useEventApi.ts`) is the typed API response, derived from Nitro's `InternalApi`.
- **i18n:** every user-facing string, and every server error code (`fail(404, 'notFound')` etc.), needs a key in both `i18n/locales/vi.json` and `en.json`. Server errors surface via `app/utils/errMsg.ts`.
- **Time:** shown and entered in Vietnam time (UTC+7); stored as `timestamptz`. Poll days are plain `YYYY-MM-DD` strings.
- Money is integer VND. The per-seat share rounds up to 1,000.

## Gotchas

- `package.json` pins `flat-cache` to 6.1.23 via `overrides` (6.1.24 depends on an unpublished `cacheable`). Do not remove it casually.
- Releases: bump `VERSION` and add a section to `CHANGELOG.md` (Keep a Changelog format). The changelog describes user-visible effects in plain language.
- The user-facing README documents behaviour and a code map; update it when rules change.
