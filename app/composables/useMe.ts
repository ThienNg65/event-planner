export type Member = {
  id: number;
  name: string;
  claimed?: boolean;
  hasPin?: boolean;
  organizer?: boolean;
  emailEnabled?: boolean;
  email?: { address: string; muted: string[]; cooldownUntil: string | null } | null;
};

/** The roster plus the signed-in visitor (an httpOnly session cookie, so SSR knows it too). */
export function useMe() {
  const { data: me, refresh: refreshMe } = useFetch<Member | null>('/api/me', { key: 'me', default: () => null });
  const { data: members, refresh } = useFetch<Member[]>('/api/members', { key: 'members', default: () => [] });
  const meId = computed(() => me.value?.id ?? null);
  return { meId, me, members, refresh, refreshMe };
}
