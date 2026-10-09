<script setup lang="ts">
const { t } = useI18n();
const { meId } = useMe();
const { data: events, refresh } = await useFetch('/api/events', { default: () => [] });
// Personal status comes from the `me` cookie, so switching person reloads the list.
watch(meId, () => refresh());

type Bucket = 'planning' | 'upcoming' | 'past';
const now = Date.now();
const started = (e: (typeof events.value)[number]) => e.startsAt !== null && new Date(e.startsAt).getTime() < now;
const bucketOf = (e: (typeof events.value)[number]): Bucket => {
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
  pay: 'i-lucide-wallet',
  lock: 'i-lucide-lock',
  bill: 'i-lucide-receipt',
  settle: 'i-lucide-sparkles',
} as const;
const todos = computed(() =>
  events.value.flatMap((e) => {
    const { step, action } = nextStep({
      stage: e.stage,
      mine: e.mine,
      manager: mounted.value && hasManageKey(e.id),
      allPaid: e.allPaid,
      started: started(e),
    });
    const out: { key: string; event: typeof e; kind: keyof typeof TODO_ICON }[] = [];
    if (action) out.push({ key: `${e.id}-${action}`, event: e, kind: action });
    if (step === 'vote' || step === 'rsvp' || step === 'pay') out.push({ key: `${e.id}-${step}`, event: e, kind: step });
    return out;
  })
);

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
          <UButton to="/new" icon="i-lucide-plus">{{ t('home.new') }}</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <section v-if="events.length" :aria-label="t('home.todo.title')">
        <UCard v-if="!meId" :ui="{ root: 'ring-2 ring-primary/40', body: 'space-y-3' }">
          <p class="font-semibold text-highlighted">{{ t('home.todo.who') }}</p>
          <MemberPicker />
        </UCard>
        <div v-else-if="todos.length" class="space-y-2">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
            {{ t('home.todo.title') }}
            <UBadge color="secondary" variant="solid" size="sm" :label="String(todos.length)" />
          </h2>
          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <NuxtLink
              v-for="td in todos"
              :key="td.key"
              :to="`/e/${td.event.id}`"
              class="flex items-center gap-3 rounded-xl bg-default p-3 ring ring-default transition hover:ring-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary/15 text-secondary"><UIcon :name="TODO_ICON[td.kind]" class="size-5" /></span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-highlighted">
                  {{ t(`home.todo.${td.kind}`, { amount: fmtVnd(td.event.mine?.owes ?? 0) }) }}
                </span>
                <span class="block truncate text-sm text-muted">{{ td.event.title }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
            </NuxtLink>
          </div>
        </div>
        <p v-else class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-sparkles" class="text-secondary" />{{ t('home.todo.none') }}
        </p>
      </section>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UTabs v-model="filter" :items="tabs" :content="false" size="sm" class="w-full sm:w-auto" />
        <UInput v-model="q" icon="i-lucide-search" :placeholder="t('home.search')" class="w-full sm:w-72" />
      </div>

      <div v-if="!events.length" class="grid place-items-center gap-3 rounded-xl border border-dashed border-default py-16 text-center">
        <img src="/apple-touch-icon.png" alt="" class="size-20" />
        <p class="font-semibold text-highlighted">{{ t('home.emptyTitle') }}</p>
        <p class="max-w-sm text-sm text-muted">{{ t('home.empty') }}</p>
        <UButton to="/new" icon="i-lucide-plus" size="lg">{{ t('home.new') }}</UButton>
      </div>
      <p v-else-if="!shown.length" class="py-10 text-center text-muted">{{ t('home.noMatch') }}</p>
      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <EventCard v-for="e in shown" :key="e.id" :event="e" />
      </div>
    </template>
  </UDashboardPanel>
</template>
