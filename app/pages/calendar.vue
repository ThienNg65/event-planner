<script setup lang="ts">
const { t, locale } = useI18n();
const { data: events } = await useFetch('/api/events', { default: () => [] });

const today = toTeamInput(new Date().toISOString()).slice(0, 10);
const cursor = ref({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
function shift(by: number) {
  const d = new Date(Date.UTC(cursor.value.y, cursor.value.m + by, 1));
  cursor.value = { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}
function goToday() {
  cursor.value = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 };
}

const days = computed(() => monthGrid(cursor.value.y, cursor.value.m));
const monthKey = computed(() => `${cursor.value.y}-${String(cursor.value.m + 1).padStart(2, '0')}`);
const title = computed(() =>
  new Date(Date.UTC(cursor.value.y, cursor.value.m, 1)).toLocaleDateString(locale.value, { timeZone: 'UTC', month: 'long', year: 'numeric' })
);
const weekdays = computed(() =>
  monthGrid(2026, 5)
    .slice(0, 7)
    .map((d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', weekday: 'short' }))
);

const CHIP = {
  poll: 'bg-warning/15 text-warning',
  rsvp: 'bg-primary/15 text-primary',
  bill: 'bg-success/15 text-success',
  settled: 'bg-secondary/15 text-secondary',
};

type Entry ={ id: number; title: string; stage: keyof typeof STAGE_COLOR; tentative: boolean; time: string | null };
// Fixed events sit on their team-time day; events still polling show on every candidate day, tentatively.
const byDay = computed(() => {
  const map = new Map<string, Entry[]>();
  const put = (day: string, e: Entry) => map.set(day, [...(map.get(day) ?? []), e]);
  for (const e of events.value) {
    const base = { id: e.id, title: e.title, stage: e.stage };
    if (e.startsAt) put(toTeamInput(e.startsAt).slice(0, 10), { ...base, tentative: false, time: toTeamInput(e.startsAt).slice(11) });
    else for (const d of e.pollDays) put(d, { ...base, tentative: true, time: null });
  }
  return map;
});
const agenda = computed(() => days.value.filter((d) => d.startsWith(monthKey.value) && byDay.value.has(d)));
</script>

<template>
  <UDashboardPanel id="calendar">
    <template #header>
      <UDashboardNavbar :title="t('calendar.title')">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UButton color="neutral" variant="outline" size="sm" @click="goToday">{{ t('calendar.today') }}</UButton>
          <UFieldGroup size="sm">
            <UButton color="neutral" variant="outline" icon="i-lucide-chevron-left" :aria-label="t('calendar.prev')" @click="shift(-1)" />
            <UButton color="neutral" variant="outline" icon="i-lucide-chevron-right" :aria-label="t('calendar.next')" @click="shift(1)" />
          </UFieldGroup>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="page-title capitalize">{{ title }}</h2>
        <span class="flex items-center gap-2 text-xs text-muted">
          <span class="size-3 rounded-sm border border-dashed border-warning bg-warning/10" />{{ t('calendar.tentative') }}
        </span>
      </div>

      <!-- Month grid (sm and up) -->
      <div class="hidden overflow-hidden rounded-xl ring ring-default sm:block">
        <div class="grid grid-cols-7 border-b border-default bg-elevated/50 text-center text-xs font-medium text-muted">
          <div v-for="w in weekdays" :key="w" class="py-2">{{ w }}</div>
        </div>
        <div class="grid grid-cols-7 grid-rows-6 divide-x divide-y divide-default">
          <div
            v-for="d in days"
            :key="d"
            class="min-h-28 space-y-1 p-1.5"
            :class="d.startsWith(monthKey) ? 'bg-default' : 'bg-elevated/40 text-dimmed'"
          >
            <span
              class="inline-grid size-6 place-items-center rounded-full text-xs tabular-nums"
              :class="d === today ? 'bg-primary font-semibold text-inverted' : ''"
            >{{ Number(d.slice(8)) }}</span>
            <NuxtLink
              v-for="e in byDay.get(d) ?? []"
              :key="`${e.id}-${d}`"
              :to="`/e/${e.id}`"
              class="block truncate rounded px-1.5 py-0.5 text-xs font-medium hover:opacity-80"
              :class="e.tentative ? 'border border-dashed border-warning bg-warning/10 text-warning' : CHIP[e.stage]"
              :title="e.title"
            >
              <span v-if="e.time" class="tabular-nums opacity-75">{{ e.time }} </span>{{ e.title }}
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Agenda (mobile) -->
      <div class="sm:hidden">
        <p v-if="!agenda.length" class="py-10 text-center text-muted">{{ t('calendar.empty') }}</p>
        <ul v-else class="space-y-4">
          <li v-for="d in agenda" :key="d">
            <p class="mb-1.5 text-sm font-semibold" :class="d === today ? 'text-primary' : 'text-highlighted'">{{ fmtDay(d, locale) }}</p>
            <div class="space-y-1.5">
              <NuxtLink
                v-for="e in byDay.get(d)"
                :key="e.id"
                :to="`/e/${e.id}`"
                class="flex items-center gap-3 rounded-lg p-3 ring ring-default"
                :class="{ 'border border-dashed border-warning ring-0': e.tentative }"
              >
                <span class="w-12 shrink-0 text-sm text-muted tabular-nums">{{ e.time ?? '—' }}</span>
                <span class="min-w-0 flex-1 truncate font-medium text-highlighted">{{ e.title }}</span>
                <UBadge :color="STAGE_COLOR[e.stage]" variant="subtle" size="sm" :label="t(`stage.${e.stage}`)" />
              </NuxtLink>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </UDashboardPanel>
</template>
