import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
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

export async function requireMember(id: unknown) {
  const [m] = Number.isInteger(id)
    ? await useDb().select().from(schema.members).where(eq(schema.members.id, id as number))
    : [];
  if (!m) fail(400, 'unknownMember');
  return m;
}
