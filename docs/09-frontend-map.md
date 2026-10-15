# 9. Frontend map

Nuxt 4 + Nuxt UI (dashboard layout), Vue 3 `<script setup>` with TypeScript, Tailwind 4. SSR is on; the app renders the same text on server and browser.

## Pages

| Route | File | What it is |
|---|---|---|
| `/` | `app/pages/index.vue` | Home: "needs you" to-do list, tabs All / Planning / Upcoming / Past, search, event cards. If nobody is signed in it shows the "who are you" card instead of to-dos. |
| `/new` | `app/pages/new.vue` | Create form: quick-start templates (they set only a title and a cover), title, note, cover, theme, date mode (poll days / fixed), place mode (fixed / let people suggest), seat limit, guests per person, hide-results switch, honorees, payment info. `/new?from=<id>` (the Duplicate button on the event page, organizers only) prefills it from an earlier event: title, note, place, seat and guest limits, hide-results switch, honorees, cover and theme, and the bank details only when the visitor created that event; never dates, answers, keys or the joining link. Needs a signed-in member; a visitor first sees a name-only picker. Create stays disabled, with a hint for the first missing thing: sign in, title, poll days, or date. |
| `/e/:id` | `app/pages/e/[id].vue` | The event page (below). |
| `/email/revert` | `app/pages/email/revert.vue` | The "not me" page opened from an address-change mail: a button that calls `POST /api/me/email/revert` (the token stays in the `#t=` fragment; opening the page changes nothing). |
| `/calendar` | `app/pages/calendar.vue` | Month grid and agenda: locked events solid on their day; an event still polling shows as a dashed "tentative" pill on its first candidate day of each month, with "· N days to vote on". |

Shell: `app/layouts/default.vue` is the sidebar (nav, "who am I" menu with set/change PIN, the sign-in link, "Sign out other devices" (in-page confirm; ends every other session and the old link, see [03](03-identity-and-roles.md)) and sign-out (sign-out also forgets stored keys, see [03](03-identity-and-roles.md)), "Tidy the team list" for organizers (`me.organizer`: an archive dialog over the roster, with a per-member "Reset PIN" that shows the new PIN once), language toggle, appearance settings, dark-mode toggle). A sign-in link `/#signin=<token>` is consumed there on mount.

## The event page

`[id].vue` fetches `GET /api/events/:id` (sending the stored manage key) and composes:

| Piece | Component | Shows |
|---|---|---|
| Header | in `[id].vue` | Cover (a strip on phones, a square beside the title on `sm`+), When and Where rows with icon tiles (a month/day tile once the date is set), stage stepper in the navbar centre on `lg`+ (poll → rsvp → bill → settled; the current step is titled by `stageKey`), the stage badge below `lg` and the Cancelled badge on a cancelled event, title, date, place (a Google Maps link adds a map icon, `VenueMap.vue`, that opens a keyless embedded map; there is no CSP today, a future one needs `frame-src https://maps.google.com https://www.google.com`), host, going count (hidden during `poll`), "Add to calendar" links (calendar file `GET /api/events/:id/ics?j=<joinKey>` and a Google Calendar link from `googleCalendarUrl`; shown whenever `startsAt` is set and the event is not cancelled, in any stage; both carry the joining link), note with @mention chips, notice banner, cancelled banner, co-host invite banner |
| Next-step card | `EventNextStep.vue` | The visitor's one next thing (`nextStep()`), plus the organizer's controls: Lock, Close/Reopen voting, Enter bill (before the start: when it opens), Complete, Complete with open debts. Owns the lock, bill and complete dialogs. The Completed card shows "Who came" avatars. After voting closes a participant also sees "Most votes: <day> (<n>)". |
| Reminder card | `EventReminder.vue` | Organizers (`can(role, 'remind')`) while the event is not cancelled, in `poll` only while voting is open, and in `rsvp` only until the start time (afterwards the badge reads "awaiting the bill"). Hidden once `settled`, and in `bill` while there is no share (nothing owed), and for a lapsed seat hold the member is listed as not answered (`reminderOf` takes `data.held`). Names from `reminderOf`, over `data.participants` (only people who joined the event, the same "no reply yet" roster the page shows) (not voted / not answered / needs to confirm / not paid), a "Copy reminder" button, and "Everyone has voted / answered / paid" when the list is empty. Client-only render (a fixed-height placeholder avoids a layout jump). The `<pre>` previews are focusable regions. |
| Stage section (one of) | `EventPoll.vue` / `EventRsvp.vue` / `EventBill.vue` | Day tiles and place list with Yes / If need be voting; RSVP buttons and guests; bill, share, QR and payment form |
| People | `EventPeople.vue` | Everyone with a vote or answer, ranked; organizer row menu |
| Side rail (after the stage section on phones) | `EventOverview.vue`, member avatars, `EventOrganizers.vue` | Counts and key facts (the seat limit too, while polling); roster avatars (declined ones marked); host/co-hosts and "Manage organizers" |
| Organizer-only (client-only render) | `EventEdit.vue`, `EventOrganizersDialog.vue`, `EventHostMenu.vue`, `EventCorrectDialog.vue`, `EventDaysDialog.vue` (`EventHostMenu` also holds the creator's **Hand over…** picker) | Edit panel, roles and links (the organizers dialog copies the manage link as `/e/:id#key=<key>`; the host can "Make a new manage link" after an in-page confirm: `POST /api/events/:id/key`, then `saveManageKey`), reopen/cancel/delete, date/place correction, poll day editing |
| Sharing | `EventShareDialog.vue` | Message preview with a vi/en toggle (default vi) and "Copy message", the joining link (`/e/:id?join=<key>&s=<stage>`), QR and the system share sheet; the page's `og:image` is `GET /api/events/:id/card?j=…`; co-host invite links carry `?join=` too |
| Handover (everyone, renders only for the two parties) | `EventHandover.vue` | The target's accept/decline card (accepting stores the new manage key via `saveManageKey`) and the creator's "offered to X" note with Cancel offer |
| After create | `EventKeepAccess.vue` | The "Set a PIN" modal, shown only to a creator with no PIN, see [03](03-identity-and-roles.md) |

## Sharing and reminders

- After `POST /api/events` succeeds, `new.vue` sets `useState('justCreated')` to the new id; the event page opens its share dialog once and clears the flag (it lives in memory, so a refresh does not reopen it). When that dialog closes, the keep-access ("Set a PIN") modal opens once, only if the creator has no PIN.
- Texts for chat apps are built by `shareMessage` and `reminderMessage` in `app/utils/messages.ts` from the `msg.*` keys, with an explicit locale chosen in the dialog's vi/en toggle (`MessageLangToggle.vue`), not the app's language. Dates use `fmtDateTime` (Vietnam time). A cancelled event gets a "cancelled" text, and an RSVP past its start time a neutral details-and-link text (no "are you coming?"). Tested in `test/messages.test.ts`.
- The link is the joining link (`?join=<key>`, which a private event needs) plus `&s=<stage>`, so each stage is a new URL and chat apps refresh a stale preview; `s` is ignored by the page, and `og:url` carries both (the secret is already in `og:image`, in the same HTML). Reminder texts use the same link. The calendar file link is a plain `<a download>` (not a router link). The message language toggle loads the other locale's messages first (`loadLocaleMessages`): locales are lazy-loaded with no fallback. A message never contains a manage key or a sign-in link.
- A payment reminder names the people who still owe, or only counts them (toggle); it never includes an amount.

Finished stages collapse to one summary line each ("12 voted", "8 seats").
"Edit" saves on request; "Post an update" (notice) publishes at once; stage moves are explicit buttons.

## How data flows

- **Read**: `useFetch` per page. After any write the component emits `changed` and the page calls `refresh()`; nothing is cached client-side beyond that.
- **Write**: `useEventApi(eventId, manageKey)` returns `call(path, method, body)`, which attaches `x-manage-key`, toasts the translated error on failure and returns `true/false`. Host-menu dialogs call `$fetch` directly so errors show inline and the dialog stays open.
- **Who am I**: `useMe()` returns the roster and the signed-in member from `/api/members` and `/api/me`. "No reply yet" counts and reminders use the event's participants (`data.participants`, people who joined), so archived members and people who never joined drop out. The session is an httpOnly cookie, so SSR already knows it.
- **Roles**: the server returns `role` in the event response. The UI uses it with `can(role, action)` from `shared/utils/roles.ts`. The browser's `localStorage` keys (`useManageKey.ts`) only *carry* the credential; they never decide on their own what to show, except on the home list, where `hasManageKey(id)` adds organizer to-dos after mount.
- **Shared rules**: anything the server and the UI must agree on lives in `shared/utils/` and is imported by both. The UI previews what the server will do (lock impact, hold impact, capacity impact) with the same functions, so previews cannot drift from behaviour.
- **Optimistic bits**: day taps (Yes or If need be) show at once (`draft` in `EventPoll`) while saves run; everything else waits for the refresh.

## Internationalisation

- Two files: `i18n/locales/vi.json` (default) and `en.json`. `strategy: 'no_prefix'`; the choice is the `lang` cookie.
- **Every user-facing string, and every server error code, needs a key in both files.** Server codes are `err.<code>`.
- Weekday names for Vietnamese come from a fixed table (`VI_WEEKDAY` in `app/utils/format.ts`) because Node and Chrome render "Th 6" and "Thứ 6" differently, which would break hydration.
- Currency is shown with `toLocaleString('vi-VN')` plus ` ₫`, in both languages.

## Time

- One team time zone, **Asia/Ho_Chi_Minh (UTC+7, no DST)**, used for entering, displaying and for "today". Helpers: `teamTime(day, 'HH:mm')` (→ ISO instant), `toTeamInput`, `teamDay`, `teamToday`.
- Instants are stored as `timestamptz`. Poll days are calendar dates (`YYYY-MM-DD`), never instants.
- Both server and browser decide "started" and "voting open" from their own clocks. The server's clock is authoritative for writes.

## Look and feel

- Themes (`shared/utils/theme.ts`): `aurora` (default), `liquid`, `bento`, `brutal`, `acid`, `scrapbook`, `candy`. An event's `theme` re-skins its whole page (`useEventTheme`); the visitor's own default is the `app-theme` cookie (`useAppTheme`). CSS tokens: `app/assets/css/main.css`, `themes.css`; component defaults: `app/app.config.ts`.
- Covers (`shared/utils/cover.ts`): six gradient presets or an `https://` image; the server share card uses the same colours as hex stops.
- Brand colours come from the logo (indigo; amber for celebratory states). Light and dark mode via the sidebar toggle.
- Confetti (`app/utils/confetti.ts`) marks first vote, Going, paid, locked, settled; skipped under `prefers-reduced-motion`.
- Avatars: two-letter initials and a colour per member (`MemberAvatar.vue`, `initials()`).

## Component index

`CoverPicker`, `DateTimeInput`, `EventBill`, `EventCard`, `EventCorrectDialog`, `EventDaysDialog`, `EventEdit`, `EventHandover`, `EventHostMenu`, `EventKeepAccess`, `EventNextStep`, `EventOrganizers`, `EventOrganizersDialog`, `EventOverview`, `EventPeople`, `EventPoll`, `EventReminder`, `EventRsvp`, `EventShareDialog`, `MemberAvatar`, `MemberEmail` (email section of the account menu, hidden unless `me.emailEnabled`; see [13](13-email.md)), `MemberPicker` (also the "Forgot your PIN?" email recovery), `MessageLangToggle`, `PollDaysInput`, `ThemePicker`: all in `app/components/`.
