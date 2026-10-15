import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const REPEAT_KINDS = ['weekly', 'biweekly', 'monthly'] as const;
export const STAGES = ['poll', 'rsvp', 'bill', 'settled'] as const;
export const STATUSES = ['going', 'maybe', 'no'] as const;
// How a "going" answer came about when the member didn't give it: counted from their votes, or held after a plan change.
export const DERIVED = ['going', 'reconfirm'] as const;

export const members = pgTable('members', {
  id: serial().primaryKey(),
  name: text().notNull().unique(),
  // sha256 of the random sign-in token held in the httpOnly `sid` cookie; null until someone claims the name.
  tokenHash: text().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  // Set when someone hides a leftover member from the roster; cleared when the member signs in or is added again.
  archivedAt: timestamp({ withTimezone: true }),
  // `salt:hash` (hex, scrypt) of the 6-digit sign-in PIN; null until the member sets one.
  pinHash: text(),
  // Wrong PINs since the last good one; at the limit the name is locked until `pinLockedUntil`.
  pinFails: integer().notNull().default(0),
  pinLockedUntil: timestamp({ withTimezone: true }),
});

// One row per extra browser signed in with a PIN. The first browser's token stays in `members.tokenHash`.
export const memberSessions = pgTable('member_sessions', {
  tokenHash: text().primaryKey(),
  memberId: integer()
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  'events',
  {
    id: serial().primaryKey(),
    title: text().notNull(),
    note: text().notNull().default(''),
    stage: text({ enum: STAGES }).notNull(),
    pollDays: date({ mode: 'string' }).array().notNull().default(sql`'{}'`),
    startsAt: timestamp({ withTimezone: true }),
    venue: text(),
    venueLink: text(),
    capacity: integer(),
    // Most guests one member may bring; null means the default of 10 (the hard ceiling).
    maxGuests: integer(),
    // While true, the poll hides everyone's votes from a visitor until they have voted themselves.
    hideVotes: boolean().notNull().default(false),
    billTotal: integer(),
    bankId: text(),
    bankAccount: text(),
    bankHolder: text(),
    // A COVERS preset key or an https image URL; null → gradient picked from the id.
    cover: text(),
    // Members the event is for (birthday people, the guest of honour): the poll shows which days they can make.
    honorees: integer().array().notNull().default(sql`'{}'`),
    // A THEMES key (shared/utils/theme.ts): how the event page and its card look.
    theme: text().notNull().default('aurora'),
    createdBy: integer()
      .notNull()
      .references(() => members.id),
    manageKeyHash: text().notNull(),
    // Pending offer to hand the event over to an active co-host: the creator offers, the target accepts. Null when none.
    handoverTo: integer().references(() => members.id, { onDelete: 'set null' }),
    handoverAt: timestamp({ withTimezone: true }),
    // Second, lower-privilege key: may edit and move the event forward, but not reopen, cancel or delete it.
    coHostKeyHash: text(),
    // Secret in the joining link (/e/:id?join=…). Kept readable so organizers and participants can share the link again.
    joinKey: text().notNull().default(sql`replace(gen_random_uuid()::text, '-', '')`),
    voteDeadline: timestamp({ withTimezone: true }),
    // Cancelled is an overlay, not a stage, so restoring returns to the exact stage it was in.
    cancelledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),
    // Repeating events: how often the next one is created, and the last Vietnam day it may fall on. Applies to the whole series.
    repeat: text({ enum: REPEAT_KINDS }),
    repeatUntil: date({ mode: 'string' }),
    // The id of the first event of the series (that event points at itself); null for an event that does not repeat.
    seriesId: integer(),
    notice: text(),
    noticeAt: timestamp({ withTimezone: true }),
    // Seats held after a plan change are released at this time.
    reconfirmBy: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('events_stage', sql`${t.stage} in ('poll', 'rsvp', 'bill', 'settled')`),
    check('events_max_guests', sql`${t.maxGuests} between 0 and 10`),
    check('events_repeat', sql`${t.repeat} in ('weekly', 'biweekly', 'monthly')`),
    uniqueIndex('events_series_starts').on(t.seriesId, t.startsAt),
  ]
);

export const venues = pgTable('venues', {
  id: serial().primaryKey(),
  eventId: integer()
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  link: text().notNull().default(''),
  note: text().notNull().default(''),
  addedBy: integer()
    .notNull()
    .references(() => members.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// One row per member per event: each person only ever writes their own row.
export const responses = pgTable(
  'responses',
  {
    eventId: integer()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    memberId: integer()
      .notNull()
      .references(() => members.id),
    days: date({ mode: 'string' }).array().notNull().default(sql`'{}'`),
    venueIds: integer().array().notNull().default(sql`'{}'`),
    // "If need be" picks, kept apart from the yes picks above; a day or place in both counts as yes.
    maybeDays: date({ mode: 'string' }).array().notNull().default(sql`'{}'`),
    maybeVenueIds: integer().array().notNull().default(sql`'{}'`),
    status: text({ enum: STATUSES }),
    guests: integer().notNull().default(0),
    // Queue position for capacity: set when someone becomes "going" or adds guests.
    goingAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    // Null with paidAt set (legacy rows) means paid in full.
    paidAmount: integer(),
    // Set once, on the member's first vote; derived attendance queues by it.
    firstVotedAt: timestamp({ withTimezone: true }),
    // Null for an explicit answer; 'going' = counted from votes; 'reconfirm' = seat held after a plan change.
    derived: text({ enum: DERIVED }),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.memberId] }),
    check('responses_status', sql`${t.status} in ('going', 'maybe', 'no')`),
    check('responses_guests', sql`${t.guests} between 0 and 10`),
    check('responses_paid_amount', sql`${t.paidAmount} >= 0`),
    check('responses_derived', sql`${t.derived} in ('going', 'reconfirm')`),
    check('responses_derived_going', sql`${t.derived} is null or ${t.status} = 'going'`),
  ]
);

export const COHOST_STATUSES = ['invited', 'active'] as const;

// Named co-hosts. An invited row holds only the hash of its single-use invite; accepting swaps it for the hash of an access key.
export const cohosts = pgTable(
  'cohosts',
  {
    eventId: integer()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    memberId: integer()
      .notNull()
      .references(() => members.id),
    status: text({ enum: COHOST_STATUSES }).notNull(),
    inviteHash: text().unique(),
    keyHash: text().unique(),
    invitedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.memberId] }),
    check('cohosts_status', sql`${t.status} in ('invited', 'active')`),
    check('cohosts_invite', sql`(${t.status} = 'invited') = (${t.inviteHash} is not null)`),
    check('cohosts_key', sql`(${t.status} = 'active') = (${t.keyHash} is not null)`),
  ]
);

// A member's verified email, only ever read back to its owner. `prev*`: after a change, the old address keeps receiving
// recovery codes (and the "not me" link) until `recoveryAfter`; `consent*` records what the member agreed to and when.
export const memberEmail = pgTable('member_email', {
  memberId: integer()
    .primaryKey()
    .references(() => members.id, { onDelete: 'cascade' }),
  email: text().notNull(),
  verifiedAt: timestamp({ withTimezone: true }).notNull(),
  consentAt: timestamp({ withTimezone: true }).notNull(),
  consentVersion: text().notNull(),
  locale: text().notNull().default('vi'),
  mutedKinds: text().array().notNull().default(sql`'{}'`),
  prevEmail: text(),
  prevUntil: timestamp({ withTimezone: true }),
  recoveryAfter: timestamp({ withTimezone: true }),
});

export const CODE_PURPOSES = ['verify', 'recover'] as const;

// One live one-time code per member and purpose (a new request replaces it); only its keyed hash is stored.
// `sendsToday` / `sendsDay` count requests for the daily caps.
export const memberCodes = pgTable(
  'member_codes',
  {
    memberId: integer()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    purpose: text({ enum: CODE_PURPOSES }).notNull(),
    targetEmail: text().notNull(),
    codeHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    fails: integer().notNull().default(0),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sendsToday: integer().notNull().default(1),
    sendsDay: date({ mode: 'string' }).notNull().default(sql`current_date`),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.purpose] }), check('member_codes_purpose', sql`${t.purpose} in ('verify', 'recover')`)]
);

// One row per email handed to the mail provider in the last day or two: the daily budget is counted from it.
export const mailLog = pgTable('mail_log', {
  id: serial().primaryKey(),
  kind: text().notNull(),
  sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const NOTIFY_KINDS = ['planSet', 'paymentRequested', 'paymentRecorded', 'cancelled', 'tomorrow', 'paymentReminder'] as const;

// Outbox of event emails: a row is written in the same batch as the state change it announces, and sent after the commit.
// `fact` names what is announced (see shared/utils/notify.ts), so the same news is never queued twice; `memberId` is set when
// the mail is for one person (the payer), null when it goes to everyone concerned. Recipients are worked out when it is sent.
export const notifications = pgTable(
  'notifications',
  {
    id: serial().primaryKey(),
    kind: text({ enum: NOTIFY_KINDS }).notNull(),
    eventId: integer()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    memberId: integer().references(() => members.id, { onDelete: 'cascade' }),
    fact: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp({ withTimezone: true }),
    attempts: integer().notNull().default(0),
    nextAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // A sender that claimed the row works on it until then; a crashed one is taken over after it.
    claimedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('notifications_once').on(t.kind, t.eventId, sql`coalesce(${t.memberId}, 0)`, t.fact),
    index('notifications_due').on(t.nextAt).where(sql`${t.doneAt} is null`),
    check('notifications_kind', sql`${t.kind} in ('planSet', 'paymentRequested', 'paymentRecorded', 'cancelled', 'tomorrow', 'paymentReminder')`),
  ]
);

// One row per mail a notification handed to a recipient, written BEFORE the mail is sent: a crash in between loses that mail
// instead of sending it twice (at most once). `error` is set when the provider refused it.
export const notificationSends = pgTable(
  'notification_sends',
  {
    notificationId: integer()
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    memberId: integer()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    error: text(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.memberId] })]
);
