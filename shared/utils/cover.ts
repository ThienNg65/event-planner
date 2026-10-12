/** Preset event covers: key → Tailwind gradient classes. */
export const COVERS = {
  aurora: 'bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500',
  sunset: 'bg-gradient-to-br from-orange-400 via-rose-500 to-pink-600',
  ocean: 'bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600',
  forest: 'bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600',
  candy: 'bg-gradient-to-br from-pink-300 via-purple-300 to-indigo-400',
  slate: 'bg-gradient-to-br from-zinc-500 via-zinc-700 to-zinc-900',
} as const;

export type CoverKey = keyof typeof COVERS;
const KEYS = Object.keys(COVERS) as CoverKey[];

export const isCoverKey = (s: unknown): s is CoverKey => typeof s === 'string' && s in COVERS;

/** What to paint for an event cover: an image URL, or a preset gradient (unset → stable pick by event id). */
export function coverOf(cover: string | null, id: number): { image: string } | { gradient: string } {
  if (isCoverKey(cover)) return { gradient: COVERS[cover] };
  if (cover) return { image: cover };
  return { gradient: COVERS[KEYS[id % KEYS.length]!] };
}

/** The same presets as hex stops (from, via, to), for places Tailwind classes cannot reach: the share card image. */
export const COVER_STOPS: Record<CoverKey, [string, string, string]> = {
  aurora: ['#8b5cf6', '#d946ef', '#ec4899'],
  sunset: ['#fb923c', '#f43f5e', '#db2777'],
  ocean: ['#38bdf8', '#3b82f6', '#4f46e5'],
  forest: ['#34d399', '#14b8a6', '#0891b2'],
  candy: ['#f9a8d4', '#d8b4fe', '#818cf8'],
  slate: ['#71717a', '#3f3f46', '#18181b'],
};

/** Gradient stops for an event with no picture (unset: the same stable pick as coverOf). */
export function coverStops(cover: string | null, id: number): [string, string, string] {
  return COVER_STOPS[isCoverKey(cover) ? cover : KEYS[id % KEYS.length]!];
}

/** Short stable tag of the cover, so the share-card URL changes (and caches refresh) when the cover does. */
export function coverTag(cover: string | null): string {
  let h = 5381;
  for (const ch of cover ?? '') h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
