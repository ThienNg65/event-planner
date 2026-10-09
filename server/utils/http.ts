import { createHash, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';

export function fail(statusCode: number, message: string): never {
  throw createError({ statusCode, statusMessage: message });
}

/** Trimmed string capped at `max` chars; '' for anything that isn't a string. */
export const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);

export const intIn = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function routeId(event: H3Event) {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(404, 'notFound');
  return id;
}

/** True when the request carries the event's manage key in the x-manage-key header. */
export function isManager(event: H3Event, keyHash: string) {
  const key = getHeader(event, 'x-manage-key');
  return !!key && timingSafeEqual(Buffer.from(sha256(key), 'hex'), Buffer.from(keyHash, 'hex'));
}

export async function readJson(event: H3Event): Promise<Record<string, unknown>> {
  const body = await readBody(event).catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid');
  return body;
}
