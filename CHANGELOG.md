# Changelog

All notable changes to this project are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Each event has a theme: Aurora (the app's own look and the default), Liquid Glass, Bento, Neo-Brutal, Acid Night, Scrapbook or Game Candy. Pick it when creating the event (the page previews it live) or later in Edit. The event page and its card on the home list use the event's theme. A Preview button opens a sample event page in any theme, so you can compare them before choosing. A palette button at the bottom of the sidebar opens Appearance, where you pick your main style: the theme of the home list, calendar and new events. It is remembered in this browser; an event keeps its own theme.

## [0.4.0] - 2026-10-12

### Added
- Your votes now count as attendance: when the organizer locks the date, everyone whose votes fit is marked Going and queued by when they first voted, so nobody has to answer twice. The lock dialog shows who will be marked, who waits and who is asked to confirm.
- If the date or place changes before the event, people who were counted from their votes and no longer fit keep their seat (or place in line) until a confirm-by deadline. Confirming in time keeps their priority; declining or missing the deadline releases it.
- Organizers can complete an event that had no bill once it has started, or complete it while some people still owe. Members who still owe can keep reporting payments after it is completed, and the overview shows who still owes.
- Hosts and co-hosts can correct the date or place of a started event with "Correct date or place", which needs a public notice and leaves attendance and payments untouched.

### Changed
- The date and place can no longer be edited once the event has started or the bill is entered; use the correction instead.
- Reopening an event to voting clears answers that were counted from votes (explicit answers and votes stay), and the host must confirm when payments are already recorded.
- Events already past voting keep everyone's answers; events still in voting will mark matching voters as Going the next time they are locked. On events locked before this version, people who voted but haven't replied now see "Can you make it?" instead of "Are you coming?".

## [0.3.0] - 2026-10-11

### Added
- Co-hosts are now invited by name with a single-use link that expires after 7 days. The host sees who is invited, active or expired, can send a new link, cut someone's access or revoke them, and a co-host can leave. The old shared co-host link keeps working until revoked, and active co-hosts are listed on the event.
- Organizers can close voting at any time and reopen it later (with no deadline or a new one), without losing a single vote. The lock dialog now shows how many people voted, who has not, a vote bar per day, and what locking does.
- Automated checks of the server rules (who may change what, voting deadlines, removing a place), run with `npm run test:api`.

### Changed
- On wide screens the event page has a side panel with an overview (voting progress, deadline, seats or payments) and the organizers. Organizers also see who has not voted yet. The note sits under the title, the cover is smaller, and "Hosted by" now reads "Created by".
- Day cards in the poll show a tick circle, a "Most votes" label, a vote bar and who voted, and only the card you tap shows a spinner. Suggesting a place opens in a dialog.
- Days are now edited from "Sửa ngày" / "Edit days" above the poll. It lists who voted for each day you remove, and asks a second time before deleting those votes. The edit panel no longer has the day picker.
- **Manage** is now **Edit**, and only holds the event details. Reopening an earlier stage, cancelling and deleting moved to a **⋯** menu for the host; the co-host link and manage link moved to **Organizers**; posting an update has its own button on the event.
- Before you save, the edit panel shows who moves to the waitlist or gets a seat when you change the seat limit, that choosing a place ends the place vote, and what each person's share becomes when you correct the bill.
- When you change the date or place after people have answered, you can post an update about it in the same save.
- The voting deadline can only be edited while voting is open, and the bill can no longer be entered from the edit panel before the paying stage (use the next step).

### Fixed
- Editing the deadline of a closed poll no longer reopens it by accident, and reopening a poll no longer leaves an expired deadline or the old locked date in place.
- The event can no longer be moved forward by several stages in one step.
- A day suggested while an organizer was editing days is no longer lost, and a vote can no longer bring back a day or place that was just removed. Someone voting for a day that just disappeared sees "The days just changed" and the page refreshes.
- Removing every day from a poll is refused.

## [0.2.2] - 2026-10-11

### Changed
- The edit panel now says changes apply for everyone when you save, shows "Unsaved changes", and keeps Save off until you change something.
- Saving only sends the fields you edited, so it no longer overwrites what a co-organizer changed meanwhile, or reopens a closed vote by touching the deadline.

### Fixed
- Closing the edit panel (Esc, X, Cancel or clicking outside) or leaving the page with unsaved edits now asks before throwing them away.
- A failed save keeps everything you typed and shows the error next to the field; if your organizer access was removed, it tells you instead of losing your edits.
- The confirmations for reopen, cancel, delete and replacing the co-host link now start on Cancel, not on the destructive button.

## [0.2.1] - 2026-10-11

### Added
- Organizers can invite a co-host with a separate link, set a voting deadline, post an update everyone sees, and cancel an event (and restore it later).
- Anyone can suggest a day as well as a place; duplicate places just add your vote, and organizers can remove a place.
- Payments can be partial: you see what you paid and what is left, and the QR code is for the remainder.

### Changed
- The event page is calmer: one header with the key facts, only the section that matters now, and a single list of people with their answer and payment.
- Votes, RSVPs and payments can now only be changed by the person they belong to (or an organizer), and only while that step is open.

### Fixed
- Removing a poll day no longer stops people who had voted for it from voting again.
- Opening a co-host link in the host's own browser no longer takes away the host's rights.
- Saving event edits no longer drops days that someone suggested while the form was open.
- Editing an event after moving it back from paying to RSVP no longer sends it straight back to paying.
- Home and event cards now show what you still owe, not your full share.
- People marked as paid stay paid when the bill or guest count changes later.
- A payment no longer overwrites an organizer's correction made at the same time.
- The people list no longer shows everyone as paid before the bill is entered.
- A new co-host link stays on screen to copy (it was lost on iPhone), and replacing the old one asks first.
- A revoked co-host link no longer shows organizer tasks on the home page.
- Suggesting a place someone else just added now counts your vote for it.

## [0.2.0] - 2026-10-09

### Added
- Plan any team event, not just one party: poll dates and venues, collect RSVPs with guests and a seat limit, then split the bill.
- Each person sees what they still owe and pays by VietQR code, and the organizer tracks who has paid.
- Home page lists what needs you right now: events to vote on, reply to or pay for.
- Each event shows one clear next step, for guests and for the organizer.
- Organizers can edit an event after creating it, including its title, venue, date, seats, bill and bank account.
- Calendar page shows fixed dates and the days still being voted on.
- Events can have a cover picture or color.
- Poll days are picked on a calendar, and quick-start templates help create common events.
- Confetti marks the big moments: first vote, going, paid, date locked and settled.

### Changed
- New look based on the app icon, with a sidebar, light and dark mode, and the icon as the favicon.
- Pick or switch your name from anywhere; on phones you no longer have to scroll to the bottom to vote.

## [0.1.0]

### Added
- Single birthday-party voter (first version).
