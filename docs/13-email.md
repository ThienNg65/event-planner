# 13. Email: verified address, PIN recovery and event mails

Phase 2 release R4. Email **ships switched off**: without a working Resend configuration the app sends nothing, hides every email control and answers the email endpoints with `404 emailOff`. Legal sign-off (consent text, data sent abroad to Resend) is the gate for switching it on. Release R5 adds event mails on the same plumbing ([below](#event-emails-the-outbox)); R6 will add scheduled ones.

## Switching it on

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key. Unset: nothing is sent (in local dev only, mails are written to the server log instead) |
| `MAIL_FROM` | Sender, on a domain verified in Resend, e.g. `Team Events <events@example.com>` |
| `APP_URL` | Public address of the site, used for links in mails. Required, so a link can never be built from a forged `Host` header |
| `NOTIFY_SECRET` | Long random string. Signs the "not me" link and keys the code hashes; changing it invalidates both |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated domains allowed for member emails (exact match, no subdomains); empty allows any |

They are declared in `runtimeConfig` (`nuxt.config.ts`) and read from the `NUXT_*` form or the plain variable (`server/utils/mail.ts`, `config()`). `emailEnabled()` is true when the secret and `APP_URL` are set and either the key and sender are set or the app runs in dev. `GET /api/me` returns `emailEnabled`; `GET /api/email-enabled` answers `{ enabled }` for visitors (the "Forgot your PIN?" link).

## Adding or changing an address

1. `POST /api/me/email {email, consent: true, currentPin, locale}`. The member needs a PIN (`pinRequired`), must tick the consent (`consentRequired`), the address must be plausible and on an allowed domain (`emailInvalid`, `emailDomain`) and is not already theirs (`emailSame`). A wrong PIN counts toward the sign-in lockout (`requireCurrentPin`). A six-digit code is mailed inline; limits: one per 60 s and 5 a day per member (`emailTooSoon`, 429).
2. `POST /api/me/email/verify {code, locale}`. On success `member_email` is written with `consent_at` and `consent_version` (`EMAIL_CONSENT_VERSION`; bump it when the wording changes). The consent text is `email.consent` (purpose, Resend as processor, data sent abroad, how to withdraw).
3. `DELETE /api/me/email {currentPin}` removes the address and any code in flight (withdrawing consent).
4. The address is returned **only** to its owner, in `GET /api/me` (`email: { address, muted, cooldownUntil }`). It never appears in event payloads or the roster.

## Cool-down and "not me"

Replacing a verified address sets `prev_email`, `prev_until` and `recovery_after` to now + 72 h (`previousAddress` in `shared/utils/email.ts`: a second change inside the window keeps the **original** address as previous). During that time:

- PIN recovery codes go to the previous address, not the new one.
- The previous address gets an "address changed" mail with a link `APP_URL/email/revert#t=<signed token>`. The token is `HMAC(NOTIFY_SECRET)` over `revert:<memberId>:<prev_until ms>`, so it works once and only while the window lasts. The link opens a page (`app/pages/email/revert.vue`) that changes nothing; its button calls `POST /api/me/email/revert {token}`.
- Revert is one statement (data-modifying CTE): restore `prev_email`, delete the member's `member_sessions`, replace `members.token_hash` with an unguessable value. The PIN is **not** changed: the owner then uses recovery (the code goes to the restored address) to choose a new one.

## PIN recovery by email

- `POST /api/members/:id/recover` always answers `{ sent: true }`: no verified address, a cap or a send failure look the same, so the roster can't be probed. Caps: one code per 60 s and 3 a day per member, 15 a day across all members. An exhausted mail budget answers `429 mailBudget` for every name alike (checked before the lookup).
- `POST /api/members/:id/recover/confirm {code, newPin}`: a malformed PIN is refused first (`pinFormat`, `pinWeak`) without spending the code. The code is consumed, then the pin-reset statements run (new `pin_hash`, `pin_fails` and lock cleared, `token_hash` null, sessions deleted), this browser is signed in, and a "PIN was reset" notice goes to the address(es). Every code failure answers `codeInvalid`. Allowed for organizers: the code only reaches the owner of the verified address, and the manage keys are untouched.

## One-time codes

`member_codes` holds at most one live code per member and purpose (`verify` or `recover`): `HMAC(NOTIFY_SECRET, memberId + purpose + code)`, 15 minutes, 5 wrong tries burn it. `consumeCode` (`server/utils/emailCodes.ts`) counts the try **before** comparing, in one `UPDATE … fails + 1 WHERE fails < 5 AND expires_at > now()`, like `verifyPin`, and uses the right code with a `DELETE … WHERE code_hash = … RETURNING`, so parallel uses cannot both win. `storeCode` is one `INSERT … ON CONFLICT DO UPDATE … WHERE` carrying the per-minute, per-day and global caps.

## Mail budget

Resend's free plan sends 100 a day. Every send first takes a place in `mail_log` atomically (`reserveMail`): codes and security notices are refused (`429 mailBudget`) once 95 mails went out in the last 24 hours, event mails (R5) are held until the next day above 70 (`MAIL_BUDGET_NOTIFY`), leaving room for codes. Pure maths: `mailLimit`, `mailAllowed` in `shared/utils/email.ts`. Log rows older than two days are deleted on the way.

## Event emails: the outbox

Four kinds, each sent to the member's verified address in the language saved with it (`member_email.locale`):

| Kind | Queued when | Goes to | Content |
|---|---|---|---|
| `planSet` | the plan is locked (`poll → rsvp`), or the date or place changes in `rsvp`, or a notice-backed correction changes them | everyone with a seat or on the waitlist (live holds included) | title, new time and place, link to the event |
| `paymentRequested` | the bill is entered (`rsvp → bill` with a total) or its total changes while in `bill` (reopening to `bill` sends nothing) | each seat holder who still owes, with **their own** amount | amount, a VietQR link when bank details are set, link to the event |
| `paymentRecorded` | an organizer records a payment for someone else | that member only | title and link, **no amount** |
| `cancelled` | the event is cancelled (not when it was already) | everyone with a seat or on the waitlist | title and link |

The amount appears only in the personal `paymentRequested` mail, never in the others.

**Writing.** The endpoint that makes the change adds `queuePlanSet`, `queuePaymentRequested`, `queuePaymentRecorded` or `queueCancelled` (`server/utils/outbox.ts`) to its `db.batch`: `INSERT INTO notifications … SELECT … WHERE EXISTS (<the event, plan, payment or cancellation as just written>) ON CONFLICT DO NOTHING`. A request that loses a race, or repeats the same change, queues nothing. The `fact` makes the news unique (`shared/utils/notify.ts`): a plan change is `planFact(prev)→planFact(next)` (start in ms plus place, so going back from B to A is a new announcement), a bill is `prevTotal→total`, a payment or a cancellation is its timestamp in ms. A single-statement endpoint (cancel, recording a payment, a plan edit without attendance writes) became a batch for this.

**Switched off costs nothing.** While `emailEnabled()` is false (no key, sender, secret or site address) nothing is queued at all: the endpoints add nothing to their batch and never call `dispatch`. Mail switched on later does not send what happened before; it only announces what changes after.

**Sending.** `commit` runs the batch, then `afterCommit(event, dispatch(eventId))`. `dispatch`:

1. Claims due rows (`done_at is null`, `next_at <= now()`, claim lapsed) with one guarded `UPDATE … claimed_until = now() + 2 min … FOR UPDATE SKIP LOCKED RETURNING`: two dispatchers never take the same row, and a crashed one is taken over after two minutes.
2. Loads the event, its answers and the recipients' addresses, and asks `audienceOf` (pure, `shared/utils/notify.ts`) who it is still for: **dropped, nothing sent** when the event is cancelled (except `cancelled` itself), the fact is no longer current (plan or total moved on, payment undone, cancellation restored), or the event is gone. Seats come from `seated`/`rollCall` and the share from `shareOf`, as on the page, so the numbers always match what the recipient will see.
3. `reachable` keeps members with a verified address who have not muted the kind.
4. Inserts the recipients' `notification_sends` rows (`ON CONFLICT DO NOTHING … RETURNING`) **before sending**. Only the rows this call inserted are sent, so no recipient is mailed twice, even if a row is claimed again. A crash between the insert and the send loses that one mail: **at most once** (docs/11, item 37).
5. Sends each through `sendMail` with the `notify` budget. If the day's budget is used up (`mailBudget`), the places not yet used are given back (their `notification_sends` rows deleted) and the notification waits 24 hours (`next_at`, `attempts` not counted); when it comes back it is re-checked, so a stale one is dropped. Any other send failure sets `error` on that recipient's row and is not retried. At most 15 recipients per run (`SENDS_PER_RUN`; each costs two requests and Workers allow 50); the rest stay due for the next run.
6. Marks the row done. An unexpected error (database, say) returns it to the queue with a backoff of 10, 20, 30, 40 minutes (`retryAt`) and gives up after 5 attempts.

**Where it runs.** On Cloudflare Workers `dispatch` continues after the response (`event.waitUntil`, detected by `event.context.waitUntil`). On Netlify nothing can run after the response, so the request waits for it but at most 3 seconds (`afterCommit`); whatever is left is still queued. Leftovers are picked up by the next dispatch for the same event, and by the scheduled tick in R6.

**Every mail** carries a "stop these emails" link and the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers, all pointing to `APP_URL/api/unsubscribe?t=<token>&l=<locale>`. The token is `signToken(NOTIFY_SECRET, "unsub:<memberId>:<kind>")`, so it can only mute that kind for that member. `GET` shows a page (`mail.unsubscribe.*`, with a locked-down `Content-Security-Policy` and `Referrer-Policy: no-referrer`) and changes nothing, so a mail scanner that follows the link does no harm; its button, and mail clients' one-click, `POST` the same address, which appends the kind to `member_email.muted_kinds` (idempotent) and answers a page. The profile (`MemberEmail.vue`) shows one switch per kind, backed by `POST /api/me/email/mute`. Verifying the email also covers these mails: the consent text and `EMAIL_CONSENT_VERSION` (`2026-10.2`) name them.

## Files

`shared/utils/email.ts` (constants, address and domain checks, budget maths), `server/utils/mailCrypto.ts` (code, hash, signed token), `server/utils/mailTemplates.ts` (renders `mail.<kind>.*` from the locale files), `server/utils/mail.ts` (`EmailSender`, `ResendSender`, `LogSender`, `sendMail`), `server/utils/emailCodes.ts`, `server/api/me/email*`, `server/api/members/[id]/recover*`, `app/components/MemberEmail.vue`, `app/components/MemberPicker.vue` (recovery), and for event mails `server/utils/outbox.ts` (queueing, `dispatch`, `afterCommit`), `server/utils/unsubscribe.ts`, `server/api/unsubscribe.*`, `server/api/me/email/mute.post.ts`, `shared/utils/notify.ts` (facts, `audienceOf`, `reachable`, retry rules). Tests: `test/email.test.ts`, `test/notify.test.ts`, `test/api/phase2-r4.test.ts` (the dark behaviour), `test/api/phase2-r5.test.ts` (nothing queued while email is off).
