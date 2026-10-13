<script setup lang="ts">
const props = defineProps<{ data: EventDetail; role: Role }>();
const emit = defineEmits<{ invite: [] }>();
const { t, locale } = useI18n();
const { members } = useMe();

const ev = computed(() => props.data.event);
const rs = computed(() => props.data.responses);
const voted = computed(() => rs.value.filter((r) => r.days.length || r.venueIds.length).length);
const declined = computed(() => rs.value.filter((r) => r.status === 'no' && !r.days.length && !r.venueIds.length).length);
// A "can't join" is an answer too, so it counts toward progress.
const answered = computed(() => voted.value + declined.value);
const roster = computed(() => Math.max(members.value.length, voted.value + declined.value));
// The legend rows; the first two also draw the bar segments, so dot and bar colours stay in step.
const stats = computed(() => [
  { key: 'votedL', n: voted.value, dot: 'bg-primary' },
  { key: 'declinedL', n: declined.value, dot: 'bg-inverted/35' },
  { key: 'pendingL', n: Math.max(roster.value - answered.value, 0), dot: 'ring-1 ring-accented ring-inset' },
]);
// Names of who is missing are for organizers; everyone else sees the count.
const pending = computed(() => (can(props.role, 'edit') ? pendingVoters(members.value, rs.value) : []));
const open = computed(() => votingOpen(ev.value));
// "Going" counts seats and queue spots only: a held seat past its deadline is not an answer.
const count = (status: string) => (status === 'going' ? props.data.confirmed.length + props.data.waitlist.length : rs.value.filter((r) => r.status === status).length);

const payers = computed(() =>
  props.data.confirmed.map((id) => {
    const r = rs.value.find((x) => x.memberId === id)!;
    const owes = (props.data.share ?? 0) * (1 + r.guests);
    return { owes, ...paymentOf(r, owes) };
  })
);
const paidCount = computed(() => payers.value.filter((p) => p.done).length);
const owing = computed(() => payers.value.length - paidCount.value);
const collected = computed(() => payers.value.reduce((s, p) => s + Math.min(p.paid, p.owes), 0));
const total = computed(() => payers.value.reduce((s, p) => s + p.owes, 0));

// "in 5 days" depends on the clock, so it is only rendered in the browser (the server's text would not match).
const mounted = ref(false);
onMounted(() => (mounted.value = true));
// The countdown turns amber only in the last day, so it doesn't alarm for a week.
const msLeft = computed(() => (mounted.value && ev.value.voteDeadline ? new Date(ev.value.voteDeadline).getTime() - Date.now() : null));
const soon = computed(() => open.value && msLeft.value !== null && msLeft.value < 86_400_000);
const relative = computed(() => {
  const ms = msLeft.value;
  if (ms === null) return '';
  const fmt = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  const days = Math.round(ms / 86_400_000);
  return Math.abs(days) >= 1 ? fmt.format(days, 'day') : fmt.format(Math.round(ms / 3_600_000), 'hour');
});
</script>

<template>
  <section class="space-y-3 themed-surface p-4" :aria-label="t('overview.title')">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-chart-pie" class="size-4 text-muted" />{{ t('overview.title') }}</h2>

    <template v-if="ev.cancelledAt">
      <p class="text-sm text-muted">{{ t('event.cancelledTitle') }}</p>
    </template>

    <template v-else-if="ev.stage === 'poll'">
      <div class="space-y-2">
        <p class="flex items-baseline justify-between gap-2 text-sm">
          <span class="font-medium text-highlighted">{{ t('overview.answered') }}</span>
          <span class="text-muted tabular-nums">{{ t('overview.answeredOf', { n: answered, total: roster }) }}</span>
        </p>
        <!-- One bar, three parts: voted, can't join, no reply yet (the empty track). -->
        <div class="flex h-2 overflow-hidden rounded-full bg-accented" role="img" :aria-label="`${t('overview.answered')} ${t('overview.answeredOf', { n: answered, total: roster })}`">
          <span v-for="s in stats.slice(0, 2)" :key="s.key" class="h-full" :class="s.dot" :style="{ width: `${(s.n / Math.max(roster, 1)) * 100}%` }" />
        </div>
      </div>
      <ul class="space-y-1.5 text-sm">
        <li v-for="s in stats" :key="s.key" class="flex items-center gap-2">
          <span class="size-2 shrink-0 rounded-full" :class="s.dot" aria-hidden="true" />
          <span class="flex-1 text-muted">{{ t(`overview.${s.key}`) }}</span>
          <span class="font-medium text-highlighted tabular-nums">{{ s.n }}</span>
        </li>
      </ul>
      <p v-if="ev.capacity" class="flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-armchair" class="size-4 shrink-0" />{{ t('overview.seatLimit', { cap: ev.capacity }) }}</p>
      <p v-if="pending.length" class="text-sm text-muted">
        {{ t('overview.notVoted', { names: pending.slice(0, 5).map((m) => m.name).join(', ') }) }}<template v-if="pending.length > 5">{{ ' ' + t('overview.more', { n: pending.length - 5 }) }}</template>
      </p>
      <div v-if="ev.voteDeadline" class="flex items-start gap-3 border-t border-default pt-3">
        <UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0 text-dimmed" />
        <div class="min-w-0 space-y-0.5">
          <p class="text-xs text-muted">{{ t(open ? 'overview.deadline' : 'overview.closedAt') }}</p>
          <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-highlighted">
            {{ fmtDateTime(ev.voteDeadline, locale) }}
            <UBadge v-if="open && relative" :color="soon ? 'warning' : 'neutral'" variant="subtle" size="sm" :label="relative" class="rounded-full" />
          </p>
        </div>
      </div>
      <UButton v-if="open" block color="neutral" variant="outline" icon="i-lucide-user-plus" @click="emit('invite')">{{ t('overview.invite') }}</UButton>
    </template>

    <template v-else-if="ev.stage === 'rsvp'">
      <UBadge v-if="ev.startsAt" color="primary" variant="subtle" icon="i-lucide-calendar-check" :label="t('overview.locked', { when: fmtDateTime(ev.startsAt, locale) })" />
      <div class="space-y-1.5">
        <p class="text-sm tabular-nums">{{ ev.capacity ? t('overview.seatsOf', { n: data.seats, cap: ev.capacity }) : t('overview.seats', { n: data.seats }) }}</p>
        <UProgress v-if="ev.capacity" :model-value="data.seats" :max="ev.capacity" size="sm" :aria-label="t('overview.seatsOf', { n: data.seats, cap: ev.capacity })" />
      </div>
      <p class="text-sm text-muted tabular-nums">
        {{ t('overview.going', { n: count('going') }) }} · {{ t('overview.maybe', { n: count('maybe') }) }} · {{ t('overview.no', { n: count('no') }) }}
      </p>
      <p v-if="data.waitlist.length" class="text-sm text-warning">{{ t('event.waitlist', { n: data.waitlist.length }) }}</p>
    </template>

    <template v-else-if="ev.stage === 'bill'">
      <div class="space-y-1.5">
        <p class="text-sm tabular-nums">{{ t('overview.paid', { n: paidCount, total: payers.length }) }}</p>
        <UProgress :model-value="collected" :max="Math.max(total, 1)" size="sm" :aria-label="t('overview.paid', { n: paidCount, total: payers.length })" />
      </div>
      <p class="text-sm text-muted tabular-nums">{{ t('overview.collected', { got: fmtVnd(collected), total: fmtVnd(total) }) }}</p>
      <p v-if="data.share !== null" class="text-sm text-muted tabular-nums">{{ t('overview.share', { amount: fmtVnd(data.share) }) }}</p>
    </template>

    <template v-else>
      <p class="text-sm text-muted">{{ t('overview.settled', { n: data.seats }) }}</p>
      <p v-if="payers.length" class="text-sm tabular-nums" :class="owing ? 'text-warning' : 'text-success'">
        {{ owing ? t('overview.completedOwed', { n: owing }) : t('overview.completedPaid') }}
      </p>
    </template>
  </section>
</template>
