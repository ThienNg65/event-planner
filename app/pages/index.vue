<script setup lang="ts">
const { t } = useI18n();
const { meId } = useMe();
const join = useJoin();
const { data: events, refresh } = await useFetch('/api/events', { default: () => [] });
// Personal status follows the signed-in member, so signing in reloads the list.
watch(meId, () => refresh());

type Bucket = 'planning' | 'upcoming' | 'past';
const now = Date.now();
const started = (e: (typeof events.value)[number]) => e.startsAt !== null && new Date(e.startsAt).getTime() < now;
const bucketOf = (e: (typeof events.value)[number]): Bucket => {
  if (e.cancelledAt) return 'past';
  if (e.stage === 'poll') return 'planning';
  const past = e.stage === 'settled' || (e.startsAt !== null && new Date(e.startsAt).getTime() < now - 6 * 3600_000);
  return past ? 'past' : 'upcoming';
};
const of = (b: Bucket) => events.value.filter((e) => bucketOf(e) === b);

// Organizer keys live in localStorage, so organizer to-dos appear after mount.
const mounted = ref(false);
onMounted(() => (mounted.value = true));
const TODO_ICON = {
  vote: 'i-lucide-vote',
  rsvp: 'i-lucide-hand',
  confirm: 'i-lucide-calendar-clock',
  pay: 'i-lucide-wallet',
  lock: 'i-lucide-lock',
  bill: 'i-lucide-receipt',
  settle: 'i-lucide-sparkles',
} as const;
// A personal to-do lands on its stage section; the organizer's moves start from the next-step card at the top.
const TODO_SECTION: Partial<Record<keyof typeof TODO_ICON, string>> = { vote: 'poll', rsvp: 'rsvp', confirm: 'rsvp', pay: 'bill' };
const todoLink = (td: { event: { id: number }; kind: keyof typeof TODO_ICON }) => `/e/${td.event.id}${TODO_SECTION[td.kind] ? `#${TODO_SECTION[td.kind]}` : ''}`;
const todos = computed(() =>
  events.value.flatMap((e) => {
    const { step, action } = nextStep({
      stage: e.stage,
      mine: e.mine,
      manager: e.manager || (mounted.value && hasManageKey(e.id)),
      allPaid: e.allPaid,
      started: started(e),
      cancelled: !!e.cancelledAt,
      votingClosed: e.stage === 'poll' && !votingOpen(e),
    });
    const out: { key: string; event: typeof e; kind: keyof typeof TODO_ICON }[] = [];
    if (action) out.push({ key: `${e.id}-${action}`, event: e, kind: action });
    if (step === 'vote' || step === 'rsvp' || step === 'confirm' || step === 'pay') out.push({ key: `${e.id}-${step}`, event: e, kind: step });
    return out;
  })
);

// The first few to-dos; the rest are one tap away.
const TODO_CAP = 3;
const allTodos = ref(false);
const shownTodos = computed(() => (allTodos.value ? todos.value : todos.value.slice(0, TODO_CAP)));

// Tabs and search only earn their place once the list is long.
const LONG_LIST = 6;

const filter = ref<'all' | Bucket>('all');
const q = ref('');
const shown = computed(() => {
  const needle = norm(q.value);
  return events.value.filter(
    (e) =>
      (filter.value === 'all' || bucketOf(e) === filter.value) &&
      (!needle || norm(`${e.title} ${e.venue ?? ''}`).includes(needle))
  );
});
// The unfiltered list reads as groups: upcoming first, then undecided, then past (empty groups are left out).
const GROUPS = ['upcoming', 'planning', 'past'] as const;
const grouped = computed(() => (filter.value === 'all' && !q.value.trim() ? GROUPS.map((b) => ({ b, events: of(b) })).filter((g) => g.events.length) : null));
const tabs = computed(() =>
  (['all', 'planning', 'upcoming', 'past'] as const).map((k) => ({
    label: k === 'all' ? t('home.all') : t(`home.${k}`),
    value: k,
    badge: k === 'all' ? events.value.length : of(k).length,
  }))
);
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar :title="t('home.title')">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <!-- The empty state has its own big button: never two solid ones. -->
          <UButton to="/new" icon="i-lucide-plus" :variant="events.length ? 'solid' : 'ghost'">{{ t('home.new') }}</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <section v-if="meId && events.length" :aria-label="t('home.todo.title')">
        <div v-if="todos.length" class="space-y-2">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
            {{ t('home.todo.title') }}
            <UBadge color="secondary" variant="solid" size="sm" :label="String(todos.length)" />
          </h2>
          <div class="rise grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <NuxtLink
              v-for="(td, i) in shownTodos"
              :key="td.key"
              :to="todoLink(td)"
              class="themed-tile flex items-center gap-3 p-3 transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary"
              :class="i === 0 && 'todo-hot'"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary/15 text-secondary"><UIcon :name="TODO_ICON[td.kind]" class="size-5" /></span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-highlighted">
                  {{ t(`home.todo.${td.kind}`, { amount: fmtVnd(td.event.mine?.left ?? 0) }) }}
                </span>
                <span class="block truncate text-sm text-muted">{{ td.event.title }}</span>
              </span>
              <span class="todo-cta inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-inverted" aria-hidden="true">
                {{ t(`home.todo.cta.${td.kind}`) }}<UIcon name="i-lucide-chevron-right" class="size-4" />
              </span>
            </NuxtLink>
          </div>
          <UButton v-if="todos.length > TODO_CAP && !allTodos" color="neutral" variant="link" size="sm" class="px-0" @click="allTodos = true">{{ t('home.seeAll') }}</UButton>
        </div>
        <p v-else class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-sparkles" class="text-secondary" />{{ t('home.todo.none') }}
        </p>
      </section>

      <div v-if="events.length >= LONG_LIST" class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UTabs v-model="filter" :items="tabs" :content="false" size="sm" class="w-full sm:w-auto" />
        <UInput v-model="q" icon="i-lucide-search" :placeholder="t('home.search')" class="w-full sm:w-72" />
      </div>

      <div v-if="!events.length" class="grid place-items-center gap-3 rounded-xl border border-dashed border-default py-16 text-center">
        <img src="/logo.svg" alt="" class="size-20" />
        <p class="font-semibold text-highlighted">{{ t('home.emptyTitle') }}</p>
        <UButton to="/new" icon="i-lucide-plus" size="lg">{{ t('home.new') }}</UButton>
        <UButton v-if="!meId" variant="link" color="neutral" size="sm" @click="join.ask()">{{ t('me.otherDeviceNew') }}</UButton>
      </div>
      <p v-else-if="!shown.length" class="py-10 text-center text-muted">{{ t('home.noMatch') }}</p>
      <div v-else-if="grouped" class="space-y-6">
        <section v-for="g in grouped" :key="g.b" :aria-label="t(`home.${g.b}`)" class="space-y-2">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">{{ t(`home.${g.b}`) }}<span class="text-xs font-normal text-muted tabular-nums">{{ g.events.length }}</span></h2>
          <div class="rise grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <EventCard v-for="e in g.events" :key="e.id" :event="e" />
          </div>
        </section>
      </div>
      <div v-else class="rise grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <EventCard v-for="e in shown" :key="e.id" :event="e" />
      </div>
    </template>
  </UDashboardPanel>
</template>
