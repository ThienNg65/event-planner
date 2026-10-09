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
