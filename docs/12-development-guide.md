# 12. Development guide

How to change the app without breaking its rules. The short working agreement for coding agents is `CLAUDE.md`; this page adds the recipes.

## Run it

Node **24.11 or newer** is required (on the team's Windows machine: put `C:\devtools\node-v24.14.1-win-x64` first on `PATH`). Put `DATABASE_URL` (a Postgres/Neon connection string) in `.env`, which is gitignored.

```bash
npm install
npm run db:migrate     # apply server/db/migrations to DATABASE_URL
npm run dev            # http://localhost:3000
npm test               # unit tests: node --test test/*.test.ts (native TypeScript, no runner)
npm run typecheck      # nuxt typecheck (vue-tsc)
npm run test:api       # builds, migrates, starts the server on :3999, runs test/api against DATABASE_URL
npm run db:generate    # after editing server/db/schema.ts
```

Single unit test: `node --test --test-name-pattern="strict first-come" test/event.test.ts`.
There is no linter. **Check which database `DATABASE_URL` points at before `test:api` or before running migrations.** Test data is named `zz-test-…` and removed after each run, but a migration is permanent.

## Recipes

### Change a business rule

1. Put the rule in `shared/utils/` (`event.ts` for event logic, `roles.ts` for permissions) so the server and the UI share one implementation.
2. Add or adjust a case in `test/event.test.ts`.
3. Use it from the API handler and from the component (preview/disable state). Never duplicate the rule in a Vue file.
4. Update the matching chapter in `docs/` and the root `README.md` if user-visible behaviour changed.

### Add an event field

1. `server/db/schema.ts` → `npm run db:generate` → commit the generated SQL **and** the `meta` snapshot.
2. Validate it in `server/utils/eventFields.ts` (the single validator for create and PATCH). New error code? Add `err.<code>` to **both** locale files.
3. It is returned automatically by `GET /api/events/:id` (everything but the key hashes). Add it to `GET /api/events` only if the list needs it.
4. UI: `new.vue` (create), `EventEdit.vue` (edit), and wherever it is displayed. `EventDetail` types follow from Nitro automatically.
5. Migrations run on every deploy (Netlify or Cloudflare), so make them additive and compatible with the previous deploy.

### Add or change a permission

Edit the `MIN_ROLE` table in `shared/utils/roles.ts`, call `requireCan(role, 'action')` in the handler and `can(role, 'action')` in the UI. Never compare roles by hand. Update the table in [03](03-identity-and-roles.md).

### Add a stage transition or a stage side effect

All stage moves live in `server/api/events/[id].patch.ts`. Keep multi-row writes in the same `db.batch` as the event UPDATE and guarded on the stage you decided in ([10](10-concurrency-and-invariants.md)). Update [02](02-event-lifecycle.md) and `nextStep()`.

### Add a user-facing string or error

Add the key to `i18n/locales/vi.json` and `en.json` (every user-facing string, every server error code). Server errors go out as `fail(status, 'code')` and come in via `errMsg()`.

### Money and time

VND is an integer; the share rounds up to 1,000. Times are stored as `timestamptz`, entered and shown in UTC+7; poll days are `YYYY-MM-DD` strings. Use `teamTime`, `teamDay`, `teamToday`; do not call `new Date(...)` on a bare day string for display.

### Email settings

Email is configured through `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`, `NOTIFY_SECRET` and `ALLOWED_EMAIL_DOMAINS` (see `.env.example` and [13](13-email.md)). Leave them unset in development unless you are working on mail: the email UI stays hidden. For local work set `NOTIFY_SECRET` only: mails then go to the dev server's log (`LogSender`), never to Resend. Tests must never call the real Resend API.

### Adding an event mail

1. Add the kind to `NOTIFY_KINDS` in `shared/utils/notify.ts` **and** in `server/db/schema.ts` (also the check constraint; a test compares the two), to `MAIL_KINDS`, and `mail.<kind>.*` plus `mail.kinds.<kind>` to both locale files.
2. Add a `queue…` helper in `server/utils/outbox.ts` with its fact and a guard that is true only in the state the batch writes; put it in the endpoint's `db.batch` and pass it to `commit(event, eventId, writes, outbox)` (a single-statement endpoint becomes a batch).
3. Teach `audienceOf` who gets it and when it is stale, and add a case to `test/notify.test.ts`. Keep amounts out of everything but a personal mail.

Full rules: [13](13-email.md#event-emails-the-outbox).

## Releases

1. Bump `VERSION`.
2. Add a section to `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.0.0/), newest first). Describe **user-visible effects in plain language**, not file or class names.
3. Push; the host (Netlify or Cloudflare) runs `db:migrate` then builds. A pushed migration reaches production on deploy.

## Gotchas

- `package.json` pins `flat-cache` to 6.1.23 via `overrides` (6.1.24 depends on an unpublished `cacheable`). Do not remove it casually.
- Organizer panels render client-only (`<ClientOnly>`) because they depend on `localStorage` keys and would not hydrate cleanly.
- The Neon HTTP driver has no interactive transactions; use `db.batch`.
- `C:\toys\CLAUDE.md` (the parent folder) holds Java/banking rules for a different project and **does not apply here**.
