/** Event themes. Aurora is the app's own look and the default; the rest are picked per event. */
export const THEMES = ['aurora', 'ticket', 'liquid', 'bento', 'brutal', 'acid', 'scrapbook', 'candy'] as const;

export type ThemeKey = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeKey = 'aurora';

export const isThemeKey = (s: unknown): s is ThemeKey => typeof s === 'string' && (THEMES as readonly string[]).includes(s);

/** Swatch colours for the picker: [background, accent]. */
export const THEME_SWATCH: Record<ThemeKey, [string, string]> = {
  aurora: ['#ede9fe', '#8b5cf6'],
  liquid: ['#dde6fa', '#0a84ff'],
  bento: ['#f4f1ea', '#ff6b3d'],
  brutal: ['#fff3b0', '#111111'],
  acid: ['#0d0d12', '#c6ff00'],
  scrapbook: ['#f6ead2', '#e0457b'],
  candy: ['#ffe1f0', '#7c4dff'],
  ticket: ['#faf8f2', '#f2d43a'],
};

/** A stored or unknown value → a valid theme key. */
export const themeOf = (s: unknown): ThemeKey => (isThemeKey(s) ? s : DEFAULT_THEME);
