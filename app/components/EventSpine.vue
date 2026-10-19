<script setup lang="ts">
// The event's four stages for every visitor: finished ones fold to one line, the current one holds its stage section (the slot),
// later ones say when they open.
const props = defineProps<{ data: EventDetail }>();
const { t } = useI18n();

const STAGES = ['poll', 'rsvp', 'bill', 'settled'] as const;
const ev = computed(() => props.data.event);
const current = computed(() => STAGES.indexOf(ev.value.stage));

const collected = computed(() => {
  const share = props.data.share ?? 0;
  return props.data.confirmed
    .map((id) => props.data.responses.find((r) => r.memberId === id)!)
    .reduce((sum, r) => sum + paymentOf(r, share * (1 + r.guests)).paid, 0);
});
const summary = (s: (typeof STAGES)[number]) => {
  if (s === 'poll') {
    const n = props.data.responses.filter(hasPicked).length;
    return n ? t('sum.poll', { n }) : t('spine.skipped');
  }
  if (s === 'rsvp') return t('sum.rsvp', { n: props.data.seats });
  if (s === 'bill') return ev.value.billTotal === null ? t('spine.noBill') : t('spine.collected', { paid: fmtVnd(collected.value), total: fmtVnd(ev.value.billTotal) });
  return '';
};
const steps = computed(() =>
  STAGES.map((s, i) => {
    const state = i < current.value ? 'done' : i === current.value ? 'now' : 'next';
    const note = state === 'done' ? summary(s) : state === 'next' ? t(`spine.next.${s}`) : '';
    return { s, i, state, note };
  })
);
</script>

<template>
  <ol class="grid" :aria-label="t('spine.label')">
    <li v-for="step in steps" :key="step.s" class="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0" :aria-current="step.state === 'now' ? 'step' : undefined">
      <span v-if="step.i < steps.length - 1" class="absolute top-7 bottom-0 left-[0.8125rem] w-0.5" :class="step.state === 'done' ? 'bg-success' : 'bg-accented'" aria-hidden="true" />
      <span
        class="relative grid size-7 place-items-center rounded-full text-xs font-bold tabular-nums ring-2"
        :class="{
          'bg-success/15 text-success ring-success': step.state === 'done',
          'spine-now bg-primary text-inverted ring-primary': step.state === 'now',
          'bg-default text-muted ring-accented': step.state === 'next',
          'opacity-60': !!ev.cancelledAt,
        }"
        aria-hidden="true"
      >
        <UIcon v-if="step.state === 'done'" name="i-lucide-check" class="size-4" />
        <template v-else>{{ step.i + 1 }}</template>
      </span>
      <div class="min-w-0">
        <p class="flex min-h-7 flex-wrap items-baseline gap-x-2 pt-0.5">
          <span class="font-semibold" :class="step.state === 'next' ? 'text-muted' : 'text-highlighted'">
            {{ t(`stages.${step.s}`) }}<span v-if="step.state === 'done'" class="sr-only"> ({{ t('spine.done') }})</span>
          </span>
          <span v-if="step.note" class="text-sm text-muted">{{ step.note }}</span>
        </p>
        <div v-if="step.state === 'now'" class="themed-surface mt-3 p-4 sm:p-5"><slot /></div>
      </div>
    </li>
  </ol>
</template>
