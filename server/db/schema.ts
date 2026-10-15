import { sql } from 'drizzle-orm';
import { boolean, check, date, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

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
    // The seat limit before the attendance check raised it to fit everyone who came; null = never raised.
    plannedCapacity: integer(),
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
    // Second, lower-privilege key: may edit and move the event forward, but not reopen, cancel or delete it.
    coHostKeyHash: text(),
    // Secret in the joining link (/e/:id?join=…). Kept readable so organizers and participants can share the link again.
    joinKey: text().notNull().default(sql`replace(gen_random_uuid()::text, '-', '')`),
    voteDeadline: timestamp({ withTimezone: true }),
    // Cancelled is an overlay, not a stage, so restoring returns to the exact stage it was in.
    cancelledAt: timestamp({ withTimezone: true }),
    cancelReason: text(),
    notice: text(),
    noticeAt: timestamp({ withTimezone: true }),
    // Seats held after a plan change are released at this time.
    reconfirmBy: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('events_stage', sql`${t.stage} in ('poll', 'rsvp', 'bill', 'settled')`)]
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
    // Had a seat but was unticked in the attendance check: shown as "said going, didn't come".
    noShow: boolean().notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.memberId] }),
    check('responses_status', sql`${t.status} in ('going', 'maybe', 'no')`),
    check('responses_guests', sql`${t.guests} between 0 and 10`),
    check('responses_paid_amount', sql`${t.paidAmount} >= 0`),
    check('responses_derived', sql`${t.derived} in ('going', 'reconfirm')`),
    check('responses_derived_going', sql`${t.derived} is null or ${t.status} = 'going'`),
    check('responses_no_show', sql`not ${t.noShow} or ${t.status} = 'no'`),
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
