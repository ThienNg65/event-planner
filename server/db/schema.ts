import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const STAGES = ['poll', 'rsvp', 'bill', 'settled'] as const;
export const STATUSES = ['going', 'maybe', 'no'] as const;

export const members = pgTable('members', {
  id: serial().primaryKey(),
  name: text().notNull().unique(),
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
    billTotal: integer(),
    bankId: text(),
    bankAccount: text(),
    bankHolder: text(),
    // A COVERS preset key or an https image URL; null → gradient picked from the id.
    cover: text(),
    createdBy: integer()
      .notNull()
      .references(() => members.id),
    manageKeyHash: text().notNull(),
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
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.memberId] }),
    check('responses_status', sql`${t.status} in ('going', 'maybe', 'no')`),
    check('responses_guests', sql`${t.guests} between 0 and 10`),
  ]
);
