export type Member = { id: number; name: string };

/** The roster plus the current visitor (member id kept in a cookie, so SSR knows it too). */
export function useMe() {
  const meId = useCookie<number | null>('me', { maxAge: 60 * 60 * 24 * 365, default: () => null });
  const { data: members, refresh } = useFetch<Member[]>('/api/members', { key: 'members', default: () => [] });
  const me = computed(() => members.value.find((m) => m.id === meId.value) ?? null);
  return { meId, me, members, refresh };
}
