<script setup lang="ts">
import type { InternalApi } from 'nitropack/types';

export type EventSummary = InternalApi['/api/events']['get'][number];

const props = defineProps<{ event: EventSummary }>();
const { t, locale } = useI18n();

const block = computed(() => props.event.startsAt && dateBlock(props.event.startsAt, locale.value));
// The span of proposed days while polling, e.g. "Thứ 3, 13 thg 10 – Thứ 6, 23 thg 10".
const range = computed(() => {
  const days = [...props.event.pollDays].sort();
  if (!days.length) return '';
  const [first, last] = [fmtDay(days[0]!, locale.value), fmtDay(days.at(-1)!, locale.value)];
  return first === last ? first : `${first} – ${last}`;
});
// The visitor's own status on this event, as a chip on the stub.
const STATUS = {
  vote: { color: 'secondary', icon: 'i-lucide-vote' },
  rsvp: { color: 'secondary', icon: 'i-lucide-hand' },
  confirm: { color: 'warning', icon: 'i-lucide-calendar-clock' },
  going: { color: 'success', icon: 'i-lucide-circle-check' },
  waitlist: { color: 'warning', icon: 'i-lucide-hourglass' },
  pay: { color: 'secondary', icon: 'i-lucide-wallet' },
  paid: { color: 'success', icon: 'i-lucide-badge-check' },
} as const;
const status = computed(() => {
  const e = props.event;
  if (!e.mine) return null;
  const { step } = nextStep({
    stage: e.stage,
    mine: e.mine,
    manager: false,
    allPaid: e.allPaid,
    started: !!e.startsAt && new Date(e.startsAt).getTime() < Date.now(),
    cancelled: !!e.cancelledAt,
    votingClosed: e.stage === 'poll' && !votingOpen(e),
  });
  return step in STATUS ? { ...STATUS[step as keyof typeof STATUS], label: t(`card.${step}`, { amount: fmtVnd(e.mine.left) }) } : null;
});
</script>

<template>
  <!-- A ticket stub: the date torn off on the left (the number of days to vote on while polling), the event on the right. -->
  <NuxtLink
    :to="`/e/${event.id}`"
    class="themed-surface group grid grid-cols-[4.5rem_minmax(0,1fr)] overflow-hidden transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary"
  >
    <div class="grid place-content-center gap-0.5 border-r-[1.5px] border-dashed border-accented bg-elevated px-1 py-4 text-center">
      <template v-if="block">
        <span class="text-xs font-semibold text-muted">{{ block.weekday }}</span>
        <span class="text-2xl leading-none font-bold text-highlighted tabular-nums">{{ block.day }}</span>
        <span class="text-xs font-semibold whitespace-nowrap text-muted">{{ block.month }}</span>
      </template>
      <template v-else>
        <span class="text-lg leading-none font-bold text-primary tabular-nums">{{ event.pollDays.length || '?' }}</span>
        <span class="text-xs font-semibold text-muted">{{ t('card.days', event.pollDays.length) }}</span>
      </template>
    </div>

    <div class="flex min-w-0 flex-col gap-1 p-3.5">
      <p class="line-clamp-2 font-semibold break-words text-highlighted group-hover:text-primary">{{ event.title }}</p>
      <p class="truncate text-sm text-muted">
        <template v-if="event.startsAt">{{ fmtDateTime(event.startsAt, locale) }}</template>
        <template v-else-if="event.pollDays.length">{{ range }}</template>
        <template v-else>{{ t('event.dateTbd') }}</template>
        <template v-if="event.venue"> · {{ event.venue }}</template>
      </p>
      <p v-if="event.stage === 'poll'" class="truncate text-xs text-muted">
        {{ t('card.answered', { n: event.answered }, event.answered) }}<template v-if="event.voteDeadline && !event.cancelledAt"> · {{ t('card.closes', { when: fmtDateTime(event.voteDeadline, locale) }) }}</template>
      </p>
      <div class="mt-auto flex flex-wrap items-center gap-1.5 pt-1.5">
        <UBadge v-if="event.cancelledAt" color="neutral" variant="soft" :label="t('card.cancelled')" class="rounded-full" />
        <template v-else>
          <UBadge v-if="status" :color="status.color" variant="soft" :icon="status.icon" :label="status.label" class="rounded-full" />
          <!-- While voting, the personal "vote now" chip already says the stage. -->
          <UBadge v-if="!(status && event.stage === 'poll')" :color="STAGE_COLOR[event.stage]" variant="outline" :label="t(`stage.${stageKey(event)}`)" class="rounded-full" />
        </template>
        <span v-if="event.stage !== 'poll'" class="ml-auto text-xs text-muted tabular-nums">
          <SeatCount :seats="event.seats" :capacity="event.capacity" :planned-capacity="event.plannedCapacity" /> {{ t('event.seats') }}
        </span>
      </div>
    </div>
  </NuxtLink>
</template>
