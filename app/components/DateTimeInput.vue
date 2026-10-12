<script setup lang="ts">
import { CalendarDateTime, parseDateTime, type DateValue } from '@internationalized/date';

// "YYYY-MM-DDTHH:mm" (or '') in the model, same shape the datetime-local inputs used.
const model = defineModel<string>({ required: true });
const { locale } = useI18n();
const open = ref(false);

const value = computed({
  get: () => {
    try {
      return model.value ? parseDateTime(model.value) : undefined;
    } catch {
      return undefined;
    }
  },
  set: (v: DateValue | null | undefined) => {
    if (!v) {
      model.value = '';
      return;
    }
    const d = v as CalendarDateTime;
    const pad = (n: number) => String(n).padStart(2, '0');
    model.value = `${d.year}-${pad(d.month)}-${pad(d.day)}T${pad(d.hour ?? 0)}:${pad(d.minute ?? 0)}`;
  },
});

// Picking a day keeps the time already typed (noon when none yet).
function pickDay(day: unknown) {
  if (!day || typeof day !== 'object' || !('day' in day)) return;
  const cur = value.value as CalendarDateTime | undefined;
  value.value = new CalendarDateTime((day as DateValue).year, (day as DateValue).month, (day as DateValue).day, cur?.hour ?? 12, cur?.minute ?? 0);
  open.value = false;
}
</script>

<template>
  <UInputDate v-model="value" granularity="minute" :hour-cycle="24" :locale="locale" class="w-full">
    <template #trailing>
      <UPopover v-model:open="open">
        <UButton color="neutral" variant="link" size="sm" icon="i-lucide-calendar" aria-label="calendar" class="px-0" />
        <template #content>
          <UCalendar :model-value="value" :week-starts-on="1" class="p-2" @update:model-value="pickDay" />
        </template>
      </UPopover>
    </template>
  </UInputDate>
</template>
