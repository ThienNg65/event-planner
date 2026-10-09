<script setup lang="ts">
import type { InternalApi } from 'nitropack/types';

export type EventSummary = InternalApi['/api/events']['get'][number];

const props = defineProps<{ event: EventSummary }>();
const { t, locale } = useI18n();

const cover = computed(() => coverOf(props.event.cover, props.event.id));
const block = computed(() => props.event.startsAt && dateBlock(props.event.startsAt, locale.value));
// The visitor's own status on this event, as a badge on the cover.
const STATUS = {
  vote: { color: 'secondary', icon: 'i-lucide-vote' },
  rsvp: { color: 'secondary', icon: 'i-lucide-hand' },
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
  });
  return step in STATUS ? { ...STATUS[step as keyof typeof STATUS], label: t(`card.${step}`, { amount: fmtVnd(e.mine.owes ?? 0) }) } : null;
});
</script>

<template>
  <NuxtLink
    :to="`/e/${event.id}`"
    class="group flex flex-col overflow-hidden rounded-xl bg-default shadow-xs ring ring-default transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"
  >
    <div class="relative h-28" :class="'gradient' in cover && cover.gradient">
      <img v-if="'image' in cover" :src="cover.image" alt="" loading="lazy" class="size-full object-cover" />
      <UBadge v-if="status" :color="status.color" variant="solid" :icon="status.icon" :label="status.label" class="absolute top-3 left-3 shadow-sm" />
      <UBadge :color="STAGE_COLOR[event.stage]" variant="solid" :label="t(`stage.${event.stage}`)" class="absolute top-3 right-3 shadow-sm" />
      <div v-if="block" class="absolute -bottom-6 left-4 grid min-w-12 place-items-center rounded-lg bg-default px-1.5 py-1 shadow-md ring ring-default">
        <span class="text-[0.625rem] font-semibold whitespace-nowrap text-primary uppercase">{{ block.month }}</span>
        <span class="text-lg leading-none font-bold text-highlighted">{{ block.day }}</span>
      </div>
      <!-- Still polling: no date yet, so show the vote instead of a misleading day. -->
      <div v-else class="absolute -bottom-6 left-4 grid size-12 place-items-center rounded-lg bg-default text-secondary shadow-md ring ring-default">
        <UIcon name="i-lucide-vote" class="size-6" />
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-1 p-4 pt-8">
      <p class="truncate font-semibold text-highlighted group-hover:text-primary">{{ event.title }}</p>
      <p class="truncate text-sm text-muted">
        <template v-if="event.startsAt">{{ fmtDateTime(event.startsAt, locale) }}</template>
        <template v-else-if="event.pollDays.length">{{ t('card.voting', { n: event.pollDays.length }) }}</template>
        <template v-else>{{ t('event.dateTbd') }}</template>
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
