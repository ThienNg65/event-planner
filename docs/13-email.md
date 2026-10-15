# 13. Email: verified address and PIN recovery

Phase 2 release R4. Email **ships switched off**: without a working Resend configuration the app sends nothing, hides every email control and answers the email endpoints with `404 emailOff`. Legal sign-off (consent text, data sent abroad to Resend) is the gate for switching it on. Releases R5 and R6 will reuse `server/utils/mail.ts` for notifications.

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

Resend's free plan sends 100 a day. Every send first takes a place in `mail_log` atomically (`reserveMail`): codes and security notices are refused (`429 mailBudget`) once 95 mails went out in the last 24 hours, notifications (R5) will defer at 70. Pure maths: `mailLimit`, `mailAllowed` in `shared/utils/email.ts`. Log rows older than two days are deleted on the way.

## Files

`shared/utils/email.ts` (constants, address and domain checks, budget maths), `server/utils/mailCrypto.ts` (code, hash, signed token), `server/utils/mailTemplates.ts` (renders `mail.<kind>.*` from the locale files), `server/utils/mail.ts` (`EmailSender`, `ResendSender`, `LogSender`, `sendMail`), `server/utils/emailCodes.ts`, `server/api/me/email*`, `server/api/members/[id]/recover*`, `app/components/MemberEmail.vue`, `app/components/MemberPicker.vue` (recovery). Tests: `test/email.test.ts`, `test/api/phase2-r4.test.ts` (the dark behaviour).
