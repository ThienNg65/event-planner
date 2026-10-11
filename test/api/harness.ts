import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;

try {
  process.loadEnvFile();
} catch {
  /* no .env file */
}

let server: ChildProcess | undefined;
const created: { id: number; key: string; dayPoll: boolean }[] = [];
let pool: Pool | undefined;
const db = () => (pool ??= new Pool({ connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL }));

/** Migrates the test database, starts the built server and waits until it answers. Call in `before`. */
export async function startServer() {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('test:api needs a database: set DATABASE_URL in .env (or TEST_DATABASE_URL to override it)');
  const env = { ...process.env, DATABASE_URL: url, PORT: String(PORT) };

  const migrate = spawnSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'migrate'], { env, encoding: 'utf8' });
  if (migrate.status !== 0) throw new Error(`db:migrate failed:\n${migrate.stdout}${migrate.stderr}`);

  server = spawn(process.execPath, ['.output/server/index.mjs'], { env, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('the built server exited early (is port 3999 in use? did you run nuxt build?)');
    if (await fetch(`${BASE}/api/members`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the built server did not answer GET /api/members within 20 s');
}

/** Deletes the events this process created, then stops the server. Call in `after`. */
export async function stopServer() {
  await cleanup();
  server?.kill();
  await pool?.end();
}

/** Runs SQL straight against the test database (the invariant checks and test setup use this). */
export async function query(text: string, params: unknown[] = []) {
  return (await db().query(text, params)).rows as Record<string, unknown>[];
}

/** An open interactive transaction: holds its row locks until `commit` or `rollback`, which pins down a request interleaving. */
export async function transaction() {
  const client = await db().connect();
  await client.query('BEGIN');
  const end = async (verb: string) => {
    try {
      await client.query(verb);
    } finally {
      client.release();
    }
  };
  return { query: async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows, commit: () => end('COMMIT'), rollback: () => end('ROLLBACK') };
}

/** Plan §10.2: I1 votes ⊆ candidate days, I2 votes ⊆ the event's places, I3 a day poll keeps 1–20 days. Throws on a violation. */
export async function assertInvariants(id: number, dayPoll = true) {
  const [i1] = await query(`SELECT count(*)::int AS n FROM responses r JOIN events e ON e.id = r.event_id WHERE r.event_id = $1 AND NOT (r.days <@ e.poll_days)`, [id]);
  const [i2] = await query(
    `SELECT count(*)::int AS n FROM responses r WHERE r.event_id = $1 AND NOT (r.venue_ids <@ COALESCE(ARRAY(SELECT v.id FROM venues v WHERE v.event_id = $1), '{}'::int[]))`,
    [id]
  );
  const [i3] = await query(`SELECT count(*)::int AS n FROM events WHERE id = $1 AND stage = 'poll' AND cardinality(poll_days) NOT BETWEEN 1 AND 20`, [id]);
  const broken = [i1.n && `I1: ${i1.n} response(s) hold a day that is not a candidate`, i2.n && `I2: ${i2.n} response(s) hold a removed place`, dayPoll && i3.n && 'I3: the day poll has no days or more than 20'].filter(Boolean);
  if (broken.length) throw new Error(`event ${id}: ${broken.join('; ')}`);
}

/** Asserts I1–I3 for, then deletes, every event created through `event()` since the last cleanup. Call in `afterEach`. */
export async function cleanup() {
  const broken: string[] = [];
  for (const { id, key, dayPoll } of created.splice(0)) {
    try {
      await assertInvariants(id, dayPoll);
    } catch (e) {
      broken.push((e as Error).message);
    }
    await api(`/api/events/${id}`, { method: 'DELETE', key });
  }
  if (broken.length) throw new Error(broken.join(', '));
}

type Opts = { method?: string; body?: unknown; key?: string; me?: number };

/** A request against the built server: `key` becomes x-manage-key, `me` the member cookie. */
export async function api(path: string, { method = 'GET', body, key, me }: Opts = {}) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (key) headers['x-manage-key'] = key;
  if (me) headers.cookie = `me=${me}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, message: res.status >= 400 ? (JSON.parse(text).statusMessage as string) : '', body: text ? JSON.parse(text) : null };
}

/** A new member named zz-test-…; returns the id. */
export async function member() {
  const res = await api('/api/members', { method: 'POST', body: { name: `zz-test-${randomBytes(4).toString('hex')}` } });
  if (res.status !== 201) throw new Error(`member() failed: ${res.status}`);
  return res.body.id as number;
}

/** `YYYY-MM-DD` for today plus `n` days (UTC is close enough for far-future poll days). */
export const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A new poll event (days +10 and +11) titled zz-test-…; `extra` overrides any create field. Returns the id, host key and creator. */
export async function event(extra: Record<string, unknown> = {}) {
  const createdBy = await member();
  const res = await api('/api/events', { method: 'POST', body: { title: `zz-test-${randomBytes(4).toString('hex')}`, pollDays: [day(10), day(11)], createdBy, ...extra } });
  if (res.status !== 201) throw new Error(`event() failed: ${res.status} ${res.message}`);
  const made = { id: res.body.id as number, key: res.body.key as string };
  created.push({ ...made, dayPoll: !!(extra.pollDays ?? [1]).length });
  return { ...made, createdBy };
}

/** Creates the co-host key for an event; returns it. */
export async function cohostKey(id: number, hostKey: string) {
  const res = await api(`/api/events/${id}/cohost`, { method: 'POST', key: hostKey });
  return res.body.key as string;
}
