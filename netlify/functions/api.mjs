import { getStore } from '@netlify/blobs';
import party from '../../config.json' with { type: 'json' };

// Each voter writes only their own key (voter/<name>), so concurrent saves never clobber each other.
const store = () => getStore({ name: 'party', consistency: 'strong' });

const json = (body, status = 200) => Response.json(body, { status });
const bad = (error) => json({ error }, 400);
const clean = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

async function loadAll(prefix) {
  const s = store();
  const { blobs } = await s.list({ prefix });
  return Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' })));
}

async function getState() {
  const [voters, restaurants] = await Promise.all([loadAll('voter/'), loadAll('restaurant/')]);
  const votes = {};
  for (const v of voters) if (v) votes[v.name] = v;
  for (const r of restaurants) {
    r.upvotes = voters.filter((v) => v?.upvotes.includes(r.id)).map((v) => v.name);
  }
  restaurants.sort((a, b) => b.upvotes.length - a.upvotes.length || a.createdAt.localeCompare(b.createdAt));
  return { config: party, votes, restaurants };
}

async function putVote(body) {
  const { name, dates, upvotes } = body ?? {};
  if (!party.team.includes(name)) return bad('Unknown name');
  if (!Array.isArray(dates) || !dates.every((d) => party.dates.includes(d))) return bad('Invalid dates');
  if (!Array.isArray(upvotes)) return bad('Invalid upvotes');
  const known = new Set((await store().list({ prefix: 'restaurant/' })).blobs.map((b) => b.key.slice(11)));
  if (!upvotes.every((id) => known.has(id))) return bad('Unknown restaurant');
  const record = { name, dates: [...new Set(dates)], upvotes: [...new Set(upvotes)], updatedAt: new Date().toISOString() };
  await store().setJSON(`voter/${name}`, record);
  return json(record);
}

async function postRestaurant(body) {
  const addedBy = body?.addedBy;
  if (!party.team.includes(addedBy)) return bad('Unknown name');
  const name = clean(body.name, 100);
  const link = clean(body.link, 500);
  const note = clean(body.note, 300);
  if (!name) return bad('Name is required');
  if (link && !/^https?:\/\//i.test(link)) return bad('Link must start with http:// or https://');
  const r = { id: crypto.randomUUID(), name, link, note, addedBy, createdAt: new Date().toISOString() };
  await store().setJSON(`restaurant/${r.id}`, r);
  return json(r, 201);
}

export default async (req) => {
  const route = `${req.method} ${new URL(req.url).pathname}`;
  const body = req.method === 'GET' ? null : await req.json().catch(() => null);
  if (route === 'GET /api/state') return json(await getState());
  if (route === 'PUT /api/vote') return putVote(body);
  if (route === 'POST /api/restaurant') return postRestaurant(body);
  return json({ error: 'Not found' }, 404);
};

export const config = { path: '/api/*' };
