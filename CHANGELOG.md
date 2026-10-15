# Changelog

All notable changes to this project are documented here, following [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Members can add a verified email and use it to reset their own forgotten PIN: ask for a code on the sign-in screen, then choose a new PIN. Adding, changing or removing the address asks for your PIN and your consent, and after a change the old address still gets recovery codes for 72 hours and a "not me" link that puts it back and signs the account out everywhere. The feature stays off, with its screens hidden, until email sending is set up.
- The host can hand an event over to a co-host: pick **Hand over…** in the host menu, and when the co-host accepts, they become the host with a new manage link and you stay on as a co-host. Only the host's own signed-in account can offer, the co-host needs a PIN, and the offer disappears if you withdraw or replace it or the co-host is removed.
- Votes on days and places can now be Yes, If need be or No. The poll shows both counts, the leader has the most Yes and then the most If need be, and people who only said If need be for the chosen day or place are asked to confirm instead of being marked Going. An If need be answer counts as having voted.
- Organizers can duplicate an event: the Duplicate button opens the create form filled in from the earlier event (title, note, place, limits, cover, theme and honorees, plus bank details if you created it), and you only pick new dates.
- Organizers can limit how many guests each person may bring (0 to 10). Anyone asking for more is told the limit; organizers can still set any number, and lowering the limit does not change answers already given.
- Organizers can hide poll results until people have voted: others' votes and the order of places stay hidden until you pick your own, so early votes do not sway the rest. Organizers always see the results.
- Signing out other devices and changing your PIN now ask for your current PIN, so someone who only got hold of your session or sign-in link cannot lock you out. Resetting a member's PIN also signs them out reliably, even if they sign out other devices at the same moment. A manage link that was replaced on another device is now forgotten and no longer offered for copying.
- The app can also be deployed on Cloudflare Workers.
- After you create an event, the share window opens by itself with a ready message to paste into Zalo, in Vietnamese or English (your choice). Copy message is the main button, and Copy link, the QR code and Share are still there. The message carries the joining link of your private event, and the link changes with each stage so chat apps show a fresh preview.
- Organizers see who has not voted, answered or paid among the people who joined the event, with a reminder message to copy. A payment reminder names the people who still owe or only counts them, and never shows amounts.
- Right after you create an event, if you have no PIN yet, you are offered to set one (or to save your sign-in link, with a warning to keep it to yourself).
- You can sign out your other devices from the account menu if a link leaks or you lose a phone. The old sign-in link stops working, your PIN stays the same and this device stays signed in.
- The host can make a new manage link if the old one leaks; the old one stops working. This works only on a device that already holds the manage link, so a leaked sign-in link alone cannot lock the host out. Copied manage links now keep the key out of link previews and server logs (the pasted text still contains it after the #, so only share it with co-hosts).
- Events with a date have an Add to calendar option (a calendar file or Google Calendar), at any stage. Entries last 2 hours and open the event through its joining link; the calendar file is only given to people who can see the event.
- After voting closes, participants see which day got the most votes while they wait for the date.
- The create form says that bank details are visible to anyone with the event link, and that a fixed date without a place starts as a vote on the place.

## [0.10.0] - 2026-10-14

### Added
- Tap "Map" next to a Google Maps place to see it on a map without leaving the page.
- The event page shows the event's progress: Vote, Confirm, Pay, Done.
- Pasting a Google Maps link into a place fills in its name, if the name is still empty.

### Changed
- A cleaner event page: the cover sits beside the title, the date and place get their own rows, and on phones your next step comes before the statistics.
- "Post an update" moved to the top bar.
- Vote bars and percentages appear once someone has voted, and the overview is shorter.

## [0.9.0] - 2026-10-14

### Changed
- Vietnamese weekdays now read "Thứ 2" … "Thứ 7" instead of "T2" … "T7".
- Events are private: only people with the joining link can see and join them; the home page lists only your events.
- "No reply yet" and the people strip count only the people who joined.

## [0.8.0] - 2026-10-14

### Added
- You now sign in with your name and a 6-digit PIN. Pick your name and type the PIN on any phone or computer; no link to copy. Choosing 111111 or 123456 is refused.
- People who already use the app are nudged to set a PIN from the sidebar menu (Set a PIN). Until they do, their sign-in link keeps working.
- After 5 wrong PINs a name is locked for 15 minutes.
- Organizers can reset a forgotten PIN in Tidy the team list. The new PIN is shown once to pass on, and that person is signed out everywhere. An organizer cannot reset another organizer.

### Changed
- Joining asks for a PIN after the name; picking an unclaimed name from the list asks you to choose its PIN.
- Signing out no longer warns you to copy the link if you have a PIN.

## [0.7.0] - 2026-10-13

### Added
- Organizers can mark who the event is for (birthday people, a guest of honour) in Edit. Every proposed day then shows whether each of them can come.
- Organizers see the leading days side by side: who can come, who can't, which honorees can come and how many haven't replied yet. A day that only wins a tie by being earlier is labelled "Tentative pick" with a note that it has no more people, and the "can't come" names are folded away.
- When days are tied, the app suggests one (the day more honorees can make, then the earlier one), explains why, and preselects it when locking.
- Once everyone has replied, organizers get a nudge to lock the date now.
- Organizers can archive leftover or test names from the team list ("Tidy the team list" in the account menu). Archived people leave the name list and the "no reply yet" counts, and come back when they sign in again.
- While voting, the event shows its seat limit.
- Before the event starts, organizers see when they will be able to enter the bill.

### Changed
- One line under the organizer buttons explains the difference between closing voting and locking, and what happens at the deadline. The lock button says "Lock date & place" when places are being voted on too.
- After voting closes, the sections read "Day results" and "Place results" without voting instructions, and the extra "voting closed: past deadline" line is gone. "Is this you?" only lets returning voters pick their name.
- Place percentages use the same base as days (everyone who voted), and each place shows "3 votes · 30%" next to its bar.
- On the Create page the name button says "Continue" and the Create button lines up with the form. The announcement title is easier to read, the event page has a single main heading, and the logo link is labelled for screen readers.
- Signing out also forgets the organizer links opened on that device, so the next person using the browser no longer gets organizer controls.
- The bill can only be entered once the event has started.
- Creating, locking or moving an event to a time that has already passed is refused.
- Only people with a seat can report a payment; organizers can still record anyone's.
- The Create button says what is still missing (your name, a title, days or a date) instead of just staying greyed out.
- The number of guests saves on its own, like Going / Maybe / Can't make it; the Update button is gone.
- The lock preview names the people who will wait for a seat.
- A started event that has no bill yet reads "Awaiting the bill" instead of "Confirmed". "Complete anyway" now reads "Complete with open debts", and the avatars on a completed event are labelled "Who came".
- The calendar shows an event that is still voting on its first proposed day of each month, with the number of days, instead of on every proposed day.

## [0.6.0] - 2026-10-13

### Added
- Event cards on the home list show how many people have replied and the range of proposed days ("9 proposed days · Tue 13 Oct – Fri 23 Oct").
- Places now show a "Leading" badge and a percentage bar, like the days.
- The Everyone list shows how many people can't make it, right in its heading.
- Mentions like @Dong Le in an event's description are highlighted.

### Changed
- Once voting closes, the page says so everywhere: the badge reads "Awaiting the date", the overview shows when voting closed, and visitors see "Waiting for <organizer> to pick the date". Days and places no longer look tappable, and tapping explains that voting is closed.
- "Can't make it" replaces "Can't" / "Bận", with a red mark. People who can't come are listed last, and their avatar is marked.
- Avatars show two initials and a colour per person, so people with the same first letter are easier to tell apart.
- The lock button now says "Lock the date" and explains that people who voted for that day are counted as going in voting order, with anyone past the seat limit waiting.
- The Create page asks only for your name (it no longer lists the team), keeps the Create button in a footer, shows "No limit" for an empty seat limit, greys out past days and rings today on the calendar.
- Organizers are listed as "Thiên (you) · Host". Text is a little larger, progress bars use the accent colour, and wide screens show four event cards per row.

### Security
- A name that created an event can no longer be claimed from the team list, so nobody can pick it and become that event's host. Its owner signs in with their sign-in or manage link.

### Fixed
- The "Who are you?" card on the Create page was squeezed to a thin dark line.

## [0.5.0] - 2026-10-12

### Added
- New logo: two overlapping circles, where the overlap is the day everyone agrees. It replaces the champagne bottle in the sidebar, the browser tab, the home screen icon and the empty home page.
- Sharing an event link now shows a proper preview card in chat and social apps: the event name, when and where, and a picture made for that event: its cover (photo or colour) with the QR code of its link in the middle.
- The Share button opens a dialog with a QR code for the event link, a copy button, and the phone's share sheet when available.
- Each event has a theme: Aurora (the app's own look and the default), Liquid Glass, Bento, Neo-Brutal, Acid Night, Scrapbook or Game Candy. Pick it when creating the event (the page previews it live) or later in Edit. The event page and its card on the home list use the event's theme. A Preview button opens a sample event page in any theme, so you can compare them before choosing. A palette button at the bottom of the sidebar opens Appearance, where you pick your main style: the theme of the home list, calendar and new events. It is remembered in this browser; an event keeps its own theme.
- Pages feel smoother: cards and sections float in one after another when a page opens, and the event page slides to the next step when it moves from voting to RSVP to the bill.
- While voting is open, you can tap "Can't join" right away instead of picking days. Your votes are withdrawn, you won't be marked Going when the date is locked, and you stop showing as "not answered"; voting again or "I can come after all" takes it back.
- People who tapped "Can't join" while voting was open now appear in the Everyone list marked as not going, instead of disappearing from it. The overview's voting progress also counts them as answered, so it reaches 100% once everyone has voted or declined.

### Changed
- You no longer pick your name from a list each time: the app signs you in once (enter your name, or claim your existing one the first time) and remembers you. The host and co-hosts now see their organizer controls whenever they are signed in, without the manage link. To use another phone or computer, copy your sign-in link from the sidebar and open it there. Sign out from the same menu to hand a shared browser to someone else.
- Dates and deadlines are now picked with a calendar and a 24-hour time field instead of the browser's built-in picker. This covers the event start, the voting deadline, the confirm-by deadline and the reopen date.
- The event page looks calmer: neutral cards and borders, with violet kept for buttons and your own picks. On the voting tiles, your picked days now stand out with a check, while vote totals are shown in gray, and the leading day is marked "Leading" instead of with a second outline. Each place shows its vote count apart from your own Vote / Voted button. The overview shows one bar with who voted, who can't join and who hasn't replied yet, and the side panel is more compact (large teams show the first faces and "+N").
- The event page's next-step card now keeps your own answer apart from the organizer's moves (close voting, lock the date, enter the bill), with only one highlighted button. Places show their name, description, vote count and your choice; removing a place moved into a menu for organizers and still asks first. The page no longer repeats the voting status, the header says how many days are proposed, and the Vietnamese wording is consistent (for example "liên kết" instead of "link").

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
