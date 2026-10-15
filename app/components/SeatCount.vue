<script setup lang="ts">
// "15/10 + 5" when walk-ins pushed the party past the planned seat limit, otherwise "8/10" (or just "8" without a limit).
const props = defineProps<{ seats: number; capacity: number | null; plannedCapacity: number | null }>();
const { t } = useI18n();
const over = computed(() => overLimit(props));
</script>

<template>
  <span v-if="over" class="inline-flex items-center gap-1">
    {{ seats }}/<span class="font-medium text-error">{{ t('overview.overLimit', { cap: plannedCapacity, n: over }) }}</span>
    <UTooltip :text="t('overview.overLimitHint', { cap: plannedCapacity, n: over })">
      <UIcon name="i-lucide-info" class="size-3.5 text-error" :aria-label="t('overview.overLimitHint', { cap: plannedCapacity, n: over })" />
    </UTooltip>
  </span>
  <span v-else>{{ capacity ? `${seats}/${capacity}` : seats }}</span>
</template>
