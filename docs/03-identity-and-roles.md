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
| Sign-out | `POST /api/me/signout` clears this browser's cookie only. The token stays valid; the sign-in link still works. |

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

- **I'm new** (`POST /api/members`): trims and collapses whitespace in the name (max 50). The name is unique as an exact string; a 409 `nameTaken` means someone has it. The UI also asks "Is that you?" when a *similar* name exists (`norm()` ignores case and diacritics: Thien / Thiên / THIEN).
- **Claim** (`POST /api/members/:id/claim`): for names added before sign-in existed (no token yet). One conditional UPDATE lets only the first claimer win. A name that **created an event** can never be claimed, because claiming would hand over host rights (`nameOrganizer`).
- **Move to another device**: `POST /api/me/link` returns the current token (requires being signed in); open `/#signin=<token>` elsewhere.
- `GET /api/members` lists the roster with `claimed` (token set, or creator of an event). `GET /api/me` returns the current member or `null`.

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
`x-manage-key` on every call. A `?key=` URL parameter is stored then stripped; when two keys exist the higher-ranked one wins.
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

`can(role, action)`: host can do everything; co-host only actions whose minimum role is co-host; participant nothing.
**Always go through `can()` / `requireCan()`**, never compare roles ad hoc.

### What participants may write

Enforced in the API, not the UI:

| Write | Participant | Organizer |
|---|---|---|
| Own votes (`days`, `venueIds`) | Only while voting is open and stage is `poll` | Any time in `poll`, on anyone's row |
| Suggest a day / place | Same window | Same |
| Own RSVP status and guests | Stage `rsvp` (and "can't join" while polling) | Any stage, anyone's row |
| Own payment | Stage `bill`; `addPaid` also in `settled` | Both stages, anyone's row, any amount |
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

- A name is only as safe as its sign-in link. Whoever holds the token acts as that member.
- Whoever holds an event's manage key is its host, **regardless of who is signed in**. Because the key sits in `localStorage`, anyone using that browser profile has host power on that event, even after signing out and signing in as someone else (see [11](11-known-behaviours.md)).
- The create page only asks for a new name and never lists others, so it can't be used to browse the roster.
