const STORE = 'te:keys';

function readKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}');
  } catch {
    return {};
  }
}

export function saveManageKey(id: number, key: string) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...readKeys(), [id]: key }));
  } catch {
    /* storage blocked: the manage link still works when opened again */
  }
}

/** True when this browser holds the organizer key for event `id` (browser-only). */
export const hasManageKey = (id: number) => id in readKeys();

/**
 * The organizer key for event `id`, browser-only. A `?key=` in the URL (a forwarded manage link)
 * is stored and then stripped from the address bar.
 */
export function useManageKey(id: number) {
  const route = useRoute();
  const router = useRouter();
  const key = ref<string | null>(null);
  // After hydration: a refresh() triggered during hydration would just reuse the SSR payload.
  onNuxtReady(() => {
    const fromUrl = route.query.key;
    if (typeof fromUrl === 'string' && fromUrl) {
      saveManageKey(id, fromUrl);
      router.replace({ query: { ...route.query, key: undefined } });
    }
    key.value = readKeys()[id] ?? null;
  });
  return key;
}
