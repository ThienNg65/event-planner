<script setup lang="ts">
const props = defineProps<{ data: EventDetail }>();
const { t, locale } = useI18n();

const ev = computed(() => props.data.event);
const series = computed(() => props.data.series);
// The next date: the event already created, else the one the tick will create (monthly keeps the first event's day of the month).
const nextAt = computed(() => {
  if (series.value?.next?.startsAt) return new Date(series.value.next.startsAt);
  if (!ev.value.repeat || !ev.value.startsAt) return null;
  const anchor = new Date(new Date(series.value?.firstAt ?? ev.value.startsAt).getTime() + 7 * 3600_000).getUTCDate();
  const next = nextOccurrence(new Date(ev.value.startsAt), ev.value.repeat, anchor);
  return ev.value.repeatUntil && vnDay(next) > ev.value.repeatUntil ? null : next;
});
</script>

<template>
  <section v-if="ev.repeat || series?.prev || series?.next" class="space-y-2 themed-surface p-4" :aria-label="t('create.repeat')">
    <p v-if="ev.repeat" class="flex items-start gap-2 text-sm text-highlighted">
      <UIcon name="i-lucide-repeat" class="mt-0.5 size-4 shrink-0 text-muted" />
      <span>
        {{ t('series.repeats', { every: t(`series.${ev.repeat}`) }) }}
        <template v-if="nextAt"> · {{ t('series.next', { when: fmtDateTime(nextAt, locale) }) }}</template>
        <template v-if="ev.repeatUntil"> · {{ t('series.until', { day: fmtDay(ev.repeatUntil, locale) }) }}</template>
      </span>
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton v-if="series?.prev" :to="`/e/${series.prev.id}`" color="neutral" variant="outline" size="sm" icon="i-lucide-chevron-left">{{ t('series.prev') }}</UButton>
      <UButton v-if="series?.next" :to="`/e/${series.next.id}`" color="neutral" variant="outline" size="sm" trailing-icon="i-lucide-chevron-right">{{ t('series.nextEvent') }}</UButton>
    </div>
  </section>
</template>
