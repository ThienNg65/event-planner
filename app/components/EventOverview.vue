<script setup lang="ts">
const props = defineProps<{ data: EventDetail; role: Role }>();
const emit = defineEmits<{ invite: [] }>();
const { t, locale } = useI18n();
const { members } = useMe();

const ev = computed(() => props.data.event);
const rs = computed(() => props.data.responses);
const voted = computed(() => rs.value.filter((r) => r.days.length || r.venueIds.length).length);
const roster = computed(() => Math.max(members.value.length, voted.value));
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
const relative = computed(() => {
  if (!mounted.value || !ev.value.voteDeadline) return '';
  const ms = new Date(ev.value.voteDeadline).getTime() - Date.now();
  const fmt = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  const days = Math.round(ms / 86_400_000);
  return Math.abs(days) >= 1 ? fmt.format(days, 'day') : fmt.format(Math.round(ms / 3_600_000), 'hour');
});
</script>

<template>
  <section class="space-y-4 themed-surface p-5" :aria-label="t('overview.title')">
    <h2 class="flex items-center gap-2 font-semibold text-highlighted"><UIcon name="i-lucide-chart-pie" class="size-5" />{{ t('overview.title') }}</h2>

    <template v-if="ev.cancelledAt">
      <p class="text-sm text-muted">{{ t('event.cancelledTitle') }}</p>
    </template>

    <template v-else-if="ev.stage === 'poll'">
      <UBadge v-if="!open" color="warning" variant="subtle" icon="i-lucide-lock" :label="t('overview.closed')" />
      <div class="space-y-2">
        <p class="text-sm tabular-nums">{{ t('overview.voted', { n: voted, total: roster }) }}</p>
        <div class="flex items-center gap-3">
          <UProgress :model-value="voted" :max="Math.max(roster, 1)" size="sm" class="flex-1" :aria-label="t('overview.voted', { n: voted, total: roster })" />
          <span class="text-xs text-muted tabular-nums">{{ Math.round((voted / Math.max(roster, 1)) * 100) }}%</span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-sm text-muted tabular-nums">
        <span class="flex items-center gap-2"><UIcon name="i-lucide-user-check" class="size-4 text-primary" />{{ t('overview.votedN', { n: voted }) }}</span>
        <span class="flex items-center gap-2"><UIcon name="i-lucide-user-round" class="size-4" />{{ t('overview.pendingN', { n: Math.max(roster - voted, 0) }) }}</span>
      </div>
      <p v-if="pending.length" class="text-sm text-muted">
        {{ t('overview.notVoted', { names: pending.slice(0, 5).map((m) => m.name).join(', ') }) }}<template v-if="pending.length > 5">{{ ' ' + t('overview.more', { n: pending.length - 5 }) }}</template>
      </p>
      <div v-if="ev.voteDeadline" class="flex items-start gap-3 border-t border-default pt-4">
        <UIcon name="i-lucide-calendar" class="mt-0.5 size-5 shrink-0 text-muted" />
        <div class="min-w-0 space-y-0.5">
          <p class="text-sm text-muted">{{ t('overview.deadline') }}</p>
          <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-highlighted">
            {{ fmtDateTime(ev.voteDeadline, locale) }}
            <UBadge v-if="relative" :color="open ? 'error' : 'neutral'" variant="subtle" size="sm" :label="relative" class="rounded-full" />
          </p>
        </div>
      </div>
      <UButton v-if="open" block color="primary" variant="soft" icon="i-lucide-user-plus" class="ring ring-primary/25" @click="emit('invite')">{{ t('overview.invite') }}</UButton>
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
