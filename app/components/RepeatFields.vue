<script setup lang="ts">
// 'none' stands for "does not repeat": a select item cannot have an empty value.
const repeat = defineModel<string>('repeat', { required: true });
const until = defineModel<string>('until', { required: true });
defineProps<{ disabled?: boolean }>();
const { t } = useI18n();
const items = computed(() => [
  { label: t('create.repeatNone'), value: 'none' },
  { label: t('create.repeatWeekly'), value: 'weekly' },
  { label: t('create.repeatBiweekly'), value: 'biweekly' },
  { label: t('create.repeatMonthly'), value: 'monthly' },
]);
</script>

<template>
  <UFormField :label="t('create.repeat')" :hint="disabled ? t('create.repeatNeeds') : undefined" :description="repeat !== 'none' ? t('create.repeatHint') : undefined">
    <div class="flex flex-wrap items-center gap-2">
      <USelect v-model="repeat" :items="items" :disabled="disabled" class="w-48" />
      <UFormField v-if="repeat !== 'none'" :label="t('create.repeatUntil')" :help="t('create.repeatUntilHint')" orientation="horizontal">
        <UInput v-model="until" type="date" />
      </UFormField>
    </div>
  </UFormField>
</template>
