import { neon } from '@neondatabase/serverless';
import { eq, inArray, sql, type SQLWrapper } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../db/schema';

export { schema };

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function useDb() {
  instance ??= drizzle(neon(process.env.DATABASE_URL!), { schema, casing: 'snake_case' });
  return instance;
}

export async function findEvent(id: number) {
  const [ev] = await useDb().select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) fail(404, 'notFound');
  return ev;
}

/** Fails unless every id is a member (honorees are picked from the team). */
export async function requireMembers(ids: number[] | undefined) {
  if (!ids?.length) return;
  const found = await useDb().select({ id: schema.members.id }).from(schema.members).where(inArray(schema.members.id, ids));
  if (found.length !== ids.length) fail(400, 'unknownMember');
}

export async function requireMember(id: unknown) {
  const [m] = Number.isInteger(id)
    ? await useDb().select().from(schema.members).where(eq(schema.members.id, id as number))
    : [];
  if (!m) fail(400, 'unknownMember');
  return m;
}

/** True when the member created an event: such a name gives host rights. (A co-host has already signed in, and an invite needs its secret link, so co-hosts need no check.) */
export const organizes = (memberId: number | SQLWrapper) =>
  sql`exists (select 1 from ${schema.events} where ${schema.events.createdBy} = ${memberId})`;
