# Changelog

All notable changes to this project are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.2] - 2026-10-11

### Added
- Automated checks of the server rules (who may change what, voting deadlines, removing a place), run with `npm run test:api`.

### Changed
- Days are now edited from "Sửa ngày" / "Edit days" above the poll. It lists who voted for each day you remove, and asks a second time before deleting those votes. The edit panel no longer has the day picker.
- The edit panel now says changes apply for everyone when you save, shows "Unsaved changes", and keeps Save off until you change something.
- Saving only sends the fields you edited, so it no longer overwrites what a co-organizer changed meanwhile, or reopens a closed vote by touching the deadline.

### Fixed
- A day suggested while an organizer was editing days is no longer lost, and a vote can no longer bring back a day or place that was just removed. Someone voting for a day that just disappeared sees "The days just changed" and the page refreshes.
- Removing every day from a poll is refused.
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
