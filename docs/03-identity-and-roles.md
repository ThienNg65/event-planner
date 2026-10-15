# 3. Identity and roles

There are **no passwords**, but each name has a **6-digit PIN**. Identity is "who this browser is signed in as", and event power is "which key this request carries".
Two independent mechanisms exist and are combined in `roleOf`.

## 3.1 Who am I? (member session)

| Concept | Detail |
|---|---|
| Token | A random 32-byte value (`base64url`). Only its SHA-256 is stored (`members.tokenHash`, unique). |
| Cookie | `sid`, `httpOnly`, `sameSite=lax`, `secure` outside dev, max-age 400 days. |
| Lookup | `meOf(event)` resolves the cookie to a member id once per request (cached in `event.context.me`). A token matches `members.tokenHash` (the first browser) or a `member_sessions` row (a browser signed in with the PIN). |
| PIN | Exactly 6 digits, not all alike and not a run like 123456 (`pinProblem` in `shared/utils/pin.ts`). Stored as `salt:hash` (scrypt, `members.pinHash`). Pick your name and enter the PIN to sign in on any device; no link needed. |
| Lockout | Each PIN guess is counted in one atomic UPDATE *before* it is checked (`verifyPin` in `server/utils/pin.ts`, used by `members/:id/signin` and, for the current PIN, by `me/pin` and `me/signout-others`), so parallel guesses cannot slip past. After 5 wrong PINs the name is locked for 15 minutes (`pinLocked`). A wrong PIN, an unknown name and a name without a PIN all answer `pinWrong`. |
| Sign-in link | `/#signin=<token>`. The page posts the token to `/api/me/signin`, which sets the cookie. The token **is** the cookie value, so the link works like a password. Kept so old links keep working; the PIN is the everyday way in. |
| Sign out other devices | `POST /api/me/signout-others` (signed in) puts a fresh token into `members.tokenHash` with `UPDATE ... WHERE id = me AND <current token still matches>`, deletes every `member_sessions` row of the member, and sets the new cookie, in one batch (the deletes only run once the swap is in, so a PIN reset or a second call racing it cannot half-apply it). A member **with a PIN must send it again** as `currentPin` (`requireCurrentPin`, same attempt counter and lockout as signing in), so a stolen session or link alone cannot lock the owner out; a member without a PIN sends nothing (a first-mover race, see [11](11-known-behaviours.md)). The old sign-in link stops working and every other device is signed out; this one stays in and the PIN is unchanged. `409 signInInvalid` if the presented token was revoked meanwhile. Use it when a link leaked or a phone was lost. |
| Keep access (UI) | After creating an event, once the share dialog closes, a "Set a PIN" modal (`EventKeepAccess.vue`) appears **only if the creator has no PIN** (`me.hasPin` false; a creator with a PIN skips it, because the PIN already brings them back). Its primary action is the same PIN form as the account menu (`POST /api/me/pin`); the secondary action copies the sign-in link (from `POST /api/me/link`; a failed fetch or clipboard write shows an error toast and the button retries) with a warning to keep it to yourself. It is kept apart from the share dialog, which never contains a manage key or a sign-in link. |
| Sign-out | `POST /api/me/signout` clears this browser's cookie. The page then forgets every manage and co-host key stored on this device (`te:keys`, `forgetAllManageKeys`), and the confirm text says so. The token stays valid; the sign-in link still works, and so does the PIN. A host gets access back by signing in (the creator is host) or by opening the manage link again. |

### Ways to become a member

```mermaid
flowchart TD
    A[Visitor opens the app] --> B{Has a sid cookie?}
    B -- yes --> Z[Signed in as that member]
    B -- no --> C{Choice}
    C -- "I'm new" --> D["POST /api/members {name, pin}"]
    D -- name free --> Z
    D -- "409 nameTaken" --> E[Pick the existing name instead]
    C -- "Pick a name that has a PIN" --> P["POST /api/members/:id/signin {pin}"]
    P -- right PIN --> Z
    P -- "401 pinWrong / 429 pinLocked" --> Q[Retry later or ask an organizer to reset]
    C -- "Pick a name with no PIN yet" --> F["POST /api/members/:id/claim {pin}"]
    F -- "unclaimed AND not an organizer" --> Z
    F -- "409 nameClaimed" --> G[Use your PIN, sign-in link, or ask an organizer]
    F -- "409 nameOrganizer" --> H[Use sign-in link or manage link]
    C -- Have a sign-in link --> I["POST /api/me/signin {token}"] --> Z
```

- **I'm new** (`POST /api/members`): takes the name and a PIN. Trims and collapses whitespace in the name (max 50). The name is unique as an exact string; a 409 `nameTaken` means someone has it. The one exception is an archived name that was never claimed and created no event: adding it again reuses that member (signs in as it and un-archives it). The UI also asks "Is that you?" when a *similar* name exists (`norm()` ignores case and diacritics: Thien / Thiên / THIEN).
- **Claim** (`POST /api/members/:id/claim {pin}`): for names added before sign-in existed (no token and no PIN yet); the claimer chooses the PIN. One conditional UPDATE lets only the first claimer win. A name that **created an event** can never be claimed, because claiming would hand over host rights (`nameOrganizer`).
- **Move to another device**: pick your name and enter your PIN there. The older way still works: `POST /api/me/link` returns the current token (requires being signed in); open `/#signin=<token>` elsewhere. A leaked link, or a lost phone, is cut off with `POST /api/me/signout-others` (see 3.1); set a PIN first if you have none.
- **Set or change a PIN** (`POST /api/me/pin {pin, currentPin}`, signed in): the first PIN needs only the session; changing an existing one needs `currentPin` too (same attempt counter and lockout as signing in), so a stolen session cannot take the name over. Members who signed in before PINs existed see a nudge in the account menu. A name that is claimed but has no PIN is not in the name list; it needs its sign-in link, or an organizer's reset.
- **Reset a PIN** (`POST /api/members/:id/pin-reset`, signed in as someone who has created an event): returns a random new PIN, shown once to pass on privately. It also signs the member out everywhere (their sessions and old sign-in link stop working); the new PIN, the token wipe and the session delete are one batch, so a concurrent sign-out-others cannot leave a session alive. Refused for a member who has created an event (`pinResetOrganizer`): it would hand their hosting rights to another organizer; they sign in with their own PIN or sign-in link.
- `GET /api/members` lists the roster (archived members left out) with `claimed` (token or PIN set, or creator of an event) and `hasPin`. `GET /api/me` returns the current member with `organizer` (has created an event) and `hasPin`, or `null`.

### Archived members

Members are team-wide and never deleted. To hide leftover or test names, anyone who has **created at least one event** may archive any member
(`POST /api/members/:id/archive`, sets `members.archivedAt`; from "Tidy the team list" in the sidebar account menu).

- An archived member drops out of `GET /api/members`, so out of the name list, the roster avatars and every "no reply yet" count.
- Their responses, votes and payments stay. Nothing else changes.
- They come back when they sign in with their PIN or sign-in link (`/api/me/signin`, `/api/members/:id/signin` and a claim from the name list all clear `archivedAt`), or, if the name was never claimed, when someone adds the same name again (see **I'm new**). A browser still signed in by cookie stays hidden until then.

## 3.2 What may I do on this event? (role)

**Access comes first.** An event is private: `requireAccess` lets in an organizer, a holder of the joining key (`x-join-key`, from `?join=` in the link), or a participant (a member with a `responses` row). Anyone else gets `notFound`, so ids can't be probed. Opening the link signed in adds an empty answer row (`GET /api/events/:id`, `joinedNow`); the creator and accepted co-hosts get one too.

```
role = host     if   x-manage-key matches events.manageKeyHash
              or   signed-in member is events.createdBy
     = cohost   if   x-manage-key matches events.coHostKeyHash         (legacy shared co-host key)
              or   an ACTIVE cohosts row matches the key (keyHash) or the signed-in member
     = null     otherwise (participant)
```

(`roleOf` in `server/utils/http.ts`; the order above is the evaluation order.)

Keys are random 32-byte `base64url` strings; only SHA-256 hashes are stored; comparison uses `timingSafeEqual`.
The browser keeps manage keys in `localStorage` under `te:keys` (`{ [eventId]: key }`) and `useEventApi` sends the stored key as
`x-manage-key` on every call. A `#key=` URL fragment (preferred: it never reaches servers or logs) or an old-style `?key=` parameter is stored then stripped; when two keys exist the higher-ranked one wins.
If the server stops accepting a key (revoked, rotated), the page forgets it.

### Permission table (`shared/utils/roles.ts`)

| Action | Co-host | Host | Used for |
|---|---|---|---|
| `edit` | ✔ | ✔ | Edit panel, notices, corrections, adding/removing poll days |
| `advance` | ✔ | ✔ | Lock, enter bill, complete, close/reopen voting |
| `removeVenue` | ✔ | ✔ | Remove a suggested place |
| `setOthers` | ✔ | ✔ | Change another member's RSVP or payment from the People list |
| `reopen` | ✘ | ✔ | Move to an earlier stage |
| `cancel` | ✘ | ✔ | Cancel, restore |
| `delete` | ✘ | ✔ | Delete the event |
| `cohost` | ✘ | ✔ | Invite, re-issue, revoke co-hosts; manage the legacy key |
| `remind` | ✔ | ✔ | See who has not voted, answered or paid, and copy a reminder (`reminderOf` in `shared/utils/event.ts`; never carries amounts) |
| `rotateKey` | ✘ | ✔ | `POST /api/events/:id/key`: replace the manage key (the old manage link stops working). Besides the host role it needs the **current manage key** in `x-manage-key` (`403 manageKeyRequired` otherwise), so a stolen creator sign-in link alone cannot lock the host out. The button only shows in a browser that holds the key. A creator with no copy of the key on any device cannot rotate it. |

`can(role, action)`: host can do everything; co-host only actions whose minimum role is co-host; participant nothing.
**Always go through `can()` / `requireCan()`**, never compare roles ad hoc.

### What participants may write

Enforced in the API, not the UI:

| Write | Participant | Organizer |
|---|---|---|
| Own votes (`days`, `venueIds`, `maybeDays`, `maybeVenueIds`) | Only while voting is open and stage is `poll` | Any time in `poll`, on anyone's row |
| Suggest a day / place | Same window | Same |
| Own RSVP status and guests | Stage `rsvp` (and "can't join" while polling) | Any stage, anyone's row |
| Own payment | Stage `bill`; `addPaid` also in `settled`; only with a seat ([06](06-bill-and-payments.md#63-recording-payments)) | Both stages, anyone's row, any amount |
| Another member's row | ✘ `notYou` (403) | ✔ |

`requireSelf` is the check: a participant may only write the row of the member their session cookie resolves to.

## 3.3 Named co-hosts (invite flow)

Up to **5** co-host rows per event, active plus pending (`MAX_COHOSTS`, `tooManyCohosts`). Invites last **7 days** (`INVITE_TTL_MS`).

```mermaid
sequenceDiagram
    participant H as Host
    participant S as Server
    participant I as Invitee
    H->>S: POST /cohosts {memberId}   (role: host)
    S-->>H: {invite}  (single-use secret, only its hash stored)
    H->>I: sends /e/:id#invite=<secret>
    I->>S: POST /cohosts/peek {invite}   (who is this for? valid / expired)
    I->>S: POST /cohosts/accept {invite} (must be signed in AS the invited member)
    S-->>I: {key}  (access key; invite burned in the same UPDATE)
    Note over I: key saved to localStorage; co-host on every device the member signs in on
    I->>S: POST /cohosts/decline {invite}  (alternative: removes the pending row)
```

- The `#invite=` fragment never reaches a server. The page moves it to `sessionStorage` and removes it from the address bar.
- Accepting swaps the row from `invited` (has `inviteHash`) to `active` (has `keyHash`); DB checks force exactly one of the two.
- The host can **re-issue** (`POST /cohosts {memberId, reissue:true}` cuts the old access) or **revoke** (`DELETE /cohosts/:memberId`). A co-host can **leave** (delete only the row their own key belongs to).
- Pending and expired invites are visible to organizers only; active co-hosts are public.
- A legacy shared co-host key (`POST/DELETE /cohost`, `events.coHostKeyHash`) still works until revoked but can no longer be created from the UI.

## 3.4 Security properties worth remembering

- A name is only as safe as its PIN and its sign-in link. Whoever knows the PIN or holds the token acts as that member (for an event's creator that includes host powers). After a leak, set a PIN if you have none, then use **Sign out other devices**; both ask for the current PIN once one exists, so a thief with only the session or link cannot do either. The roster is public, so the PIN is the only secret: six digits are kept safe by the lockout, the slow hash and the weak-PIN rules, which is enough for a team-internal app.
- The sign-in link alone cannot replace the manage key (that needs the current manage key), so a leaked creator link does not hand over the manage link. `GET /api/events/:id` returns `hostKey`: whether the `x-manage-key` this browser sent still matches. A creator's other devices keep the host role through their session after a rotation, so the page forgets a stored key when `role` is host and `hostKey` is false, and hides the copy/rotate manage-link controls.
- Whoever holds an event's manage key is its host, **regardless of who is signed in**. Because the key sits in `localStorage`, anyone using that browser profile has host power on that event while the key is stored. Signing out forgets every key on that device (see 3.1).
- The create page only asks for a new name and never lists others, so it can't be used to browse the roster.
- **Events are private, the roster is not**: an event, with every member's votes, answers and payments and its bank id, account number and holder, is readable only by an organizer, a holder of the joining key or a participant (`requireAccess`, section 3.2); anyone else gets `notFound`. The member name list is public.
