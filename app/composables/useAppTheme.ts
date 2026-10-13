/** The visitor's main style: how every page without its own event theme looks. Kept in a cookie so the server renders it too. */
export function useAppTheme() {
  const raw = useCookie<string>('app-theme', { maxAge: 60 * 60 * 24 * 365, default: () => DEFAULT_THEME });
  return computed<ThemeKey>({
    get: () => themeOf(raw.value),
    set: (v) => (raw.value = themeOf(v)),
  });
}
