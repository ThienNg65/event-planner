<script setup lang="ts">
const { t } = useI18n();
const { open, newOnly, done, cancel } = useJoin();
watch(open, (o) => !o && cancel());
</script>

<template>
  <UModal v-model:open="open" :title="t('join.title')">
    <template #body>
      <MemberPicker :new-only="newOnly" autofocus @done="done" />
    </template>
  </UModal>
</template>
