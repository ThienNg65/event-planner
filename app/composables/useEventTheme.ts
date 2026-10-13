import type { MaybeRefOrGetter } from 'vue';

/** Themes the whole page (wallpaper, surfaces, type) for as long as the calling page is mounted. */
export function useEventTheme(theme: MaybeRefOrGetter<string | null | undefined>) {
  useHead({ htmlAttrs: { 'data-theme': () => themeOf(toValue(theme)) } });
}
