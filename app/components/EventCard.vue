<script setup lang="ts">
import type { InternalApi } from 'nitropack/types';

export type EventSummary = InternalApi['/api/events']['get'][number];

const props = defineProps<{ event: EventSummary }>();
const { t, locale } = useI18n();

const cover = computed(() => coverOf(props.event.cover, props.event.id));
const block = computed(() => props.event.startsAt && dateBlock(props.event.startsAt, locale.value));
// The span of proposed days while polling, e.g. "T3, 13 thg 10 – T6, 23 thg 10".
const range = computed(() => {
  const days = [...props.event.pollDays].sort();
  if (!days.length) return '';
  const [first, last] = [fmtDay(days[0]!, locale.value), fmtDay(days.at(-1)!, locale.value)];
  return first === last ? first : `${first} – ${last}`;
});
// The visitor's own status on this event, as a badge on the cover.
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
  <NuxtLink
    :to="`/e/${event.id}`"
    :data-theme="themeOf(event.theme)"
    class="themed-surface group flex flex-col overflow-hidden transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-primary"
  >
    <div class="relative h-28" :class="'gradient' in cover && cover.gradient">
      <img v-if="'image' in cover" :src="cover.image" alt="" loading="lazy" class="size-full object-cover" />
      <UBadge v-if="status" :color="status.color" variant="solid" :icon="status.icon" :label="status.label" class="absolute top-3 left-3 shadow-sm" />
      <UBadge v-if="event.cancelledAt" color="neutral" variant="solid" :label="t('card.cancelled')" class="absolute top-3 right-3 shadow-sm" />
      <!-- While voting, the personal "vote now" badge already says the stage. -->
      <UBadge v-else-if="!(status && event.stage === 'poll')" :color="STAGE_COLOR[event.stage]" variant="solid" :label="t(`stage.${stageKey(event)}`)" class="absolute top-3 right-3 shadow-sm" />
      <div v-if="block" class="absolute -bottom-6 left-4 grid min-w-12 place-items-center rounded-lg bg-default px-1.5 py-1 shadow-md ring ring-default">
        <span class="text-[0.625rem] font-semibold whitespace-nowrap text-primary uppercase">{{ block.month }}</span>
        <span class="text-lg leading-none font-bold text-highlighted">{{ block.day }}</span>
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-1 p-4" :class="block && 'pt-8'">
      <p class="truncate font-semibold text-highlighted group-hover:text-primary">{{ event.title }}</p>
      <p class="truncate text-sm text-muted">
        <template v-if="event.startsAt">{{ fmtDateTime(event.startsAt, locale) }}</template>
        <template v-else-if="event.pollDays.length">{{ t('card.voting', { n: event.pollDays.length }, event.pollDays.length) }} · {{ range }}</template>
        <template v-else>{{ t('event.dateTbd') }}</template>
      </p>
      <p v-if="event.stage === 'poll'" class="flex items-center gap-1 truncate text-sm text-muted">
        <UIcon name="i-lucide-users-round" class="size-3.5 shrink-0" />{{ t('card.answered', { n: event.answered }, event.answered) }}
      </p>
      <p v-if="event.stage === 'poll' && event.voteDeadline && !event.cancelledAt" class="truncate text-xs text-muted">
        {{ t('card.closes', { when: fmtDateTime(event.voteDeadline, locale) }) }}
      </p>
      <p v-if="event.venue" class="flex items-center gap-1 truncate text-sm text-muted">
        <UIcon name="i-lucide-map-pin" class="size-3.5 shrink-0" />{{ event.venue }}
      </p>

      <div v-if="event.stage !== 'poll'" class="mt-auto pt-3">
        <div class="mb-1 flex justify-between text-xs text-muted tabular-nums">
          <span>{{ t('event.seats') }}</span>
          <span>{{ event.capacity ? `${event.seats}/${event.capacity}` : event.seats }}</span>
        </div>
        <UProgress v-if="event.capacity" :model-value="event.seats" :max="event.capacity" size="xs" />
      </div>
    </div>
  </NuxtLink>
</template>
