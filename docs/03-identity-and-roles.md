# 3. Identity and roles

There are **no passwords**. Identity is "who this browser is signed in as", and event power is "which key this request carries".
Two independent mechanisms exist and are combined in `roleOf`.

## 3.1 Who am I? (member session)

| Concept | Detail |
|---|---|
| Token | A random 32-byte value (`base64url`). Only its SHA-256 is stored (`members.tokenHash`, unique). |
| Cookie | `sid`, `httpOnly`, `sameSite=lax`, `secure` outside dev, max-age 400 days. |
| Lookup | `meOf(event)` resolves the cookie to a member id once per request (cached in `event.context.me`). |
| Sign-in link | `/#signin=<token>`. The page posts the token to `/api/me/signin`, which sets the cookie. The token **is** the cookie value, so the link works like a password. |
| Rotate | `POST /api/me/rotate` (signed in) swaps the token for a new one with a guarded `UPDATE members SET token_hash = new WHERE id = me AND token_hash = <current>` and sets the new cookie. The old sign-in link stops working, and every other device is signed out (one `tokenHash` per member). Use it when a link leaked. |
| Keep access (UI) | After creating an event, once the share dialog closes, a "Save your sign-in link" modal (subtitle: send it only to yourself) (`EventKeepAccess.vue`) offers **Copy sign-in link** (from `POST /api/me/link`; a failed fetch or clipboard write shows an error toast and the button retries), says the link restores the member and their organizer rights on another device, and points to **Change sign-in link** in the account menu (the sidebar, confirmed in the page, never `window.confirm`; it calls `POST /api/me/rotate` and fetches the new link). It is kept apart from the share dialog, which never contains a key or a sign-in link. |
| Sign-out | `POST /api/me/signout` clears this browser's cookie. The page then forgets every manage and co-host key stored on this device (`te:keys`, `forgetAllManageKeys`), and the confirm text says so, and that only the sign-in link brings the member back. The token stays valid; the sign-in link still works. A host gets access back by signing in (the creator is host) or by opening the manage link again. |

### Ways to become a member

```mermaid
flowchart TD
    A[Visitor opens the app] --> B{Has a sid cookie?}
    B -- yes --> Z[Signed in as that member]
    B -- no --> C{Choice}
    C -- "I'm new" --> D["POST /api/members {name}"]
    D -- name free --> Z
    D -- "409 nameTaken" --> E[Pick the existing name instead]
    C -- Pick my name --> F["POST /api/members/:id/claim"]
    F -- "unclaimed AND not an organizer" --> Z
    F -- "409 nameClaimed" --> G[Use your sign-in link]
    F -- "409 nameOrganizer" --> H[Use sign-in link or manage link]
    C -- Have a sign-in link --> I["POST /api/me/signin {token}"] --> Z
```

- **I'm new** (`POST /api/members`): trims and collapses whitespace in the name (max 50). The name is unique as an exact string; a 409 `nameTaken` means someone has it. The one exception is an archived name that was never claimed and created no event: adding it again reuses that member (signs in as it and un-archives it). The UI also asks "Is that you?" when a *similar* name exists (`norm()` ignores case and diacritics: Thien / Thiên / THIEN).
- **Claim** (`POST /api/members/:id/claim`): for names added before sign-in existed (no token yet). One conditional UPDATE lets only the first claimer win. A name that **created an event** can never be claimed, because claiming would hand over host rights (`nameOrganizer`).
- **Move to another device**: `POST /api/me/link` returns the current token (requires being signed in); open `/#signin=<token>` elsewhere. A leaked link is revoked with `POST /api/me/rotate` (see 3.1).
- `GET /api/members` lists the roster (archived members left out) with `claimed` (token set, or creator of an event). `GET /api/me` returns the current member with `organizer` (has created an event), or `null`.

### Archived members

Members are team-wide and never deleted. To hide leftover or test names, anyone who has **created at least one event** may archive any member
(`POST /api/members/:id/archive`, sets `members.archivedAt`; from "Tidy the team list" in the sidebar account menu).

- An archived member drops out of `GET /api/members`, so out of the name list, the roster avatars and every "no reply yet" count.
- Their responses, votes and payments stay. Nothing else changes.
- They come back when they sign in with their sign-in link (`/api/me/signin` and a claim from the name list both clear `archivedAt`), or, if the name was never claimed, when someone adds the same name again (see **I'm new**). A browser still signed in by cookie stays hidden until then.

## 3.2 What may I do on this event? (role)

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
| Own votes (`days`, `venueIds`) | Only while voting is open and stage is `poll` | Any time in `poll`, on anyone's row |
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

- A name is only as safe as its sign-in link. Whoever holds the token acts as that member. For an event's creator that includes host powers, so a leaked creator link is serious: rotate the sign-in link right away. The manage key is the stronger credential (it is what authorises replacing the manage key), and the sign-in link alone cannot take it over.
- Whoever holds an event's manage key is its host, **regardless of who is signed in**. Because the key sits in `localStorage`, anyone using that browser profile has host power on that event while the key is stored. Signing out forgets every key on that device (see 3.1).
- The create page only asks for a new name and never lists others, so it can't be used to browse the roster.
- **Everything is readable by anyone, by design**: all events, every member's votes, answers and payments, and the event's bank id, account number and holder. The app is team-internal; there is no per-event privacy.
