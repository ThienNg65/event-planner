import { timingSafeEqual } from 'node:crypto';

/** Hourly trigger for hosts without an in-process scheduler (Netlify). Cloudflare calls runTick directly. */
export default defineEventHandler(async (event) => {
  const secret = String(useRuntimeConfig().cronSecret || process.env.CRON_SECRET || '').trim();
  if (!secret) fail(404, 'notFound');
  const given = Buffer.from(getHeader(event, 'x-cron-secret') ?? '');
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) fail(401, 'cronSecret');
  return runTick(new Date());
});
