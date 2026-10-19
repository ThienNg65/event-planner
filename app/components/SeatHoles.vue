<script setup lang="ts">
// The seat limit as punch holes: taken ones filled, yours marked, seats past the planned limit dashed (walk-ins). A bar above
// 30 seats. Decoration for the count beside it (SeatCount), so it is one labelled image for screen readers.
const props = defineProps<{ seats: number; capacity: number | null; plannedCapacity: number | null; mine: number }>();
const { t } = useI18n();

const MAX_HOLES = 30;
const limit = computed(() => props.plannedCapacity ?? props.capacity);
const holes = computed(() => {
  const cap = limit.value ?? 0;
  return Array.from({ length: Math.max(cap, props.seats) }, (_, i) => {
    if (i < props.mine) return 'me';
    if (i >= cap) return 'over';
    return i < props.seats ? 'on' : 'free';
  });
});
const label = computed(() => {
  const parts = [t('seats.holes', { n: props.seats, cap: limit.value })];
  if (props.mine) parts.push(t('seats.yours', { n: props.mine }, props.mine));
  return parts.join(' · ');
});
</script>

<template>
  <div v-if="limit" role="img" :aria-label="label" class="seat-holes">
    <div v-if="holes.length > MAX_HOLES" class="flex h-2.5 overflow-hidden rounded-full bg-accented">
      <span class="seat-bar-me" :style="{ width: `${(Math.min(mine, seats) / holes.length) * 100}%` }" />
      <span class="seat-bar-on" :style="{ width: `${(Math.max(0, Math.min(seats, limit ?? 0) - mine) / holes.length) * 100}%` }" />
      <span class="seat-bar-over" :style="{ width: `${(Math.max(0, seats - (limit ?? 0)) / holes.length) * 100}%` }" />
    </div>
    <div v-else class="flex flex-wrap gap-1.5">
      <span v-for="(h, i) in holes" :key="i" class="seat-hole" :data-seat="h" />
    </div>
  </div>
</template>

<style scoped>
/* Themes may set --seat-me / --seat-me-ring (Ticket: pear yellow with an ink ring); the default is the primary colour. */
.seat-hole {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  border: 1.5px solid var(--ui-border-accented);
}
.seat-hole[data-seat='on'] {
  background: var(--ui-text-highlighted);
  border-color: var(--ui-text-highlighted);
}
.seat-hole[data-seat='me'] {
  background: var(--seat-me, var(--ui-primary));
  border: 2.5px solid var(--seat-me-ring, var(--ui-text-highlighted));
}
.seat-hole[data-seat='over'] {
  border-style: dashed;
  border-color: var(--ui-error);
  background: color-mix(in oklab, var(--ui-error) 12%, transparent);
}
.seat-bar-me {
  background: var(--seat-me, var(--ui-primary));
}
.seat-bar-on {
  background: var(--ui-text-highlighted);
}
.seat-bar-over {
  background: var(--ui-error);
}
</style>
