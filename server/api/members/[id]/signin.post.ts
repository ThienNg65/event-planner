import { eq } from 'drizzle-orm';

/** Signs this browser in as a member with their PIN (see `verifyPin` for the guess limit). */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(400, 'unknownMember');
  const member = await verifyPin(id, (await readJson(event)).pin, true);
  await startSession(event, id);
  return member;
});
