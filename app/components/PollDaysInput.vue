<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date';

const days = defineModel<string[]>({ required: true });
const { t } = useI18n();
const MAX = 20; // server limit (eventFields)
const today = parseDate(toTeamInput(new Date().toISOString()).slice(0, 10));

// "YYYY-MM-DD" strings in the model, CalendarDate values in the calendar.
const picked = computed({
  get: () => days.value.map((d) => parseDate(d)),
  set: (v: DateValue[] | undefined) => {
    const next = (v ?? []).map((d) => d.toString()).sort();
    if (next.length <= MAX) days.value = next;
  },
});
// One tap for the usual case: adds the next week (today included) to whatever is already picked.
const nextWeek = () => {
  const week = Array.from({ length: 7 }, (_, i) => today.add({ days: i }).toString());
  days.value = [...new Set([...days.value, ...week])].sort().slice(0, MAX);
};
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-3">
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-calendar-range" :label="t('create.next7')" @click="nextWeek" />
      <p class="text-sm text-muted">{{ t('create.daysPicked', { n: days.length, max: MAX }) }}</p>
    </div>
    <UCalendar
      v-model="picked"
      multiple
      :min-value="today"
      :week-starts-on="1"
      :aria-label="t('create.pollDates')"
      class="rounded-lg p-2 ring ring-default"
    />
  </div>
</template>
