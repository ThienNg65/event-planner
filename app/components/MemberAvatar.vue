<script setup lang="ts">
// Two letters and a color per member, so "Thiên", "Tâm" and "Tú" no longer all show as "T".
const props = defineProps<{ id?: number; name: string; size?: 'xs' | 'sm' | 'md' }>();

const COLORS = [
  'bg-rose-500/20 text-rose-700 dark:text-rose-200',
  'bg-amber-500/20 text-amber-700 dark:text-amber-200',
  'bg-emerald-500/20 text-emerald-700 dark:text-emerald-200',
  'bg-sky-500/20 text-sky-700 dark:text-sky-200',
  'bg-violet-500/20 text-violet-700 dark:text-violet-200',
  'bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-200',
  'bg-teal-500/20 text-teal-700 dark:text-teal-200',
  'bg-orange-500/20 text-orange-700 dark:text-orange-200',
];
const text = computed(() => initials(props.name));
const color = computed(() => COLORS[(props.id ?? [...props.name].reduce((h, c) => h + c.codePointAt(0)!, 0)) % COLORS.length]);
</script>

<template>
  <UAvatar :text="text" :alt="name" :size="size ?? 'sm'" :ui="{ root: color, fallback: 'text-current font-semibold' }" />
</template>
