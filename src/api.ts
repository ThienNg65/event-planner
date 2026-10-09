export type Config = { title: string; team: string[]; dates: string[] };
export type Vote = { name: string; dates: string[]; upvotes: string[]; updatedAt: string };
export type Restaurant = {
  id: string;
  name: string;
  link: string;
  note: string;
  addedBy: string;
  createdAt: string;
  upvotes: string[];
};
export type State = { config: Config; votes: Record<string, Vote>; restaurants: Restaurant[] };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export const getState = () => call<State>('GET', 'state');
export const saveVote = (v: Omit<Vote, 'updatedAt'>) => call<Vote>('PUT', 'vote', v);
export const addRestaurant = (r: { name: string; link: string; note: string; addedBy: string }) =>
  call<Restaurant>('POST', 'restaurant', r);
