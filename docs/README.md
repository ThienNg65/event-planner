# Team Events: business-flow documentation

This folder explains **how the app works**: what an event is, who may do what, how the stages move, and the rules behind
seats, votes and money. It is written for AI agents and new developers, so a rule is stated once, precisely, with the file
that implements it.

> `README.md` in the repo root is the user-facing product sheet. `CLAUDE.md` is the short working agreement for coding agents.
> These docs sit between them: the full business flow. When they disagree, **the code wins**; fix the doc.

## Read in this order

| # | Document | Answers |
|---|---|---|
| 1 | [Overview and glossary](01-overview-and-glossary.md) | What is the app, who uses it, what do the words mean? |
| 2 | [Event lifecycle](02-event-lifecycle.md) | Which stages exist, what moves an event between them, what each move does to people? |
| 3 | [Identity and roles](03-identity-and-roles.md) | How does someone "sign in" with no password, and who counts as host, co-host or participant? |
| 4 | [Polling and locking](04-polling-and-locking.md) | How are days and places voted on, how does locking turn votes into attendance, what happens when the plan changes? |
| 5 | [RSVP and seats](05-rsvp-and-seats.md) | How do answers, guests, the seat limit and the waitlist work? |
| 6 | [Bill and payments](06-bill-and-payments.md) | How is the bill split, how are payments recorded, what does "Completed" mean? |
| 7 | [Data model](07-data-model.md) | Which tables and columns exist, and which rules the database itself enforces. |
| 8 | [API reference](08-api-reference.md) | Every endpoint: who may call it, what it validates, which error codes it returns. |
| 9 | [Frontend map](09-frontend-map.md) | Where each screen lives, how it gets its data, i18n, time zone, themes. |
| 10 | [Concurrency and invariants](10-concurrency-and-invariants.md) | Why the code is shaped the way it is, and what must never be broken. |
| 11 | [Known behaviours](11-known-behaviours.md) | Surprising but intentional (or not-yet-decided) behaviours worth knowing before changing things. |
| 12 | [Development guide](12-development-guide.md) | How to add a rule, a field, a string, a migration, a release. |

## Where to look for what

| If you need to change… | Start at |
|---|---|
| A rule the server **and** the UI must agree on (seats, share, who is going, next step) | `shared/utils/event.ts`, then `test/event.test.ts` |
| Who may do an organizer action | `shared/utils/roles.ts` (`can`) and `server/utils/http.ts` (`roleOf`, `requireCan`) |
| A stage transition or event edit | `server/api/events/[id].patch.ts` (the one place stages move) |
| An RSVP, vote or payment | `server/api/events/[id]/response.put.ts` |
| What the event page shows | `app/pages/e/[id].vue` and the `Event*.vue` components |
| A user-facing string or error | `i18n/locales/vi.json` **and** `en.json` |

## Conventions used in these docs

- **Stage** names are the stored values: `poll`, `rsvp`, `bill`, `settled`. The UI calls them Voting, Confirmed, Paying, Completed.
- **Role** is `host`, `cohost` or `null` (participant). "Organizer" means host or co-host.
- File paths are relative to the repo root. `shared/…` runs on both server and browser.
- Money is integer VND. Times are stored as UTC instants and shown in Vietnam time (UTC+7).
- Error codes (like `stageClosed`) are the `statusMessage` the API returns; each has a translation under `err.*`.
- Diagrams use Mermaid, which Gitea and GitHub render.

## Keeping these docs true

Update the matching document in the same change whenever you alter a rule, a transition, a permission, an endpoint or a column.
A change that alters behaviour users can see also needs a `CHANGELOG.md` entry and a `VERSION` bump (see the development guide).
