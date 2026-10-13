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
</script>

<template>
  <div class="space-y-2">
    <UCalendar
      v-model="picked"
      multiple
      :min-value="today"
      :week-starts-on="1"
      :aria-label="t('create.pollDates')"
      class="rounded-lg p-2 ring ring-default"
    />
    <p class="text-sm text-muted">{{ t('create.daysPicked', { n: days.length, max: MAX }) }}</p>
  </div>
</template>
