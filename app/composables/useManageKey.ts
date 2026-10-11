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

/** Drops a key the server no longer accepts (e.g. a revoked co-host link). */
export function forgetManageKey(id: number) {
  try {
    const { [id]: _, ...rest } = readKeys();
    localStorage.setItem(STORE, JSON.stringify(rest));
  } catch {
    /* storage blocked: nothing stored to forget */
  }
}

const RANK: Record<string, number> = { host: 2, cohost: 1 };
const rankOf = (id: number, key: string) =>
  $fetch(`/api/events/${id}`, { headers: { 'x-manage-key': key } }).then((r) => RANK[r.role ?? ''] ?? 0, () => 0);

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
  onNuxtReady(async () => {
    const fromUrl = route.query.key;
    if (typeof fromUrl === 'string' && fromUrl) {
      const old = readKeys()[id];
      // A co-host link opened in the host's browser must not replace the host key: keep whichever key ranks higher.
      if (!old || (old !== fromUrl && (await rankOf(id, fromUrl)) > (await rankOf(id, old)))) saveManageKey(id, fromUrl);
      router.replace({ query: { ...route.query, key: undefined } });
    }
    key.value = readKeys()[id] ?? null;
  });
  return key;
}
