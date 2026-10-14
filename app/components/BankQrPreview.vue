<script setup lang="ts">
// Lets an organizer check the bank fields produce a scannable VietQR before anyone pays.
const props = defineProps<{ bankId: string; bankAccount: string; bankHolder: string }>();
const { t } = useI18n();

const open = ref(false);
const failed = ref(false);
// Amount 0 gives an open-amount QR, so the preview is not tied to any member's share.
const src = computed(() =>
  props.bankId.trim() && props.bankAccount.trim()
    ? vietqrUrl(props.bankId.trim(), props.bankAccount.trim(), props.bankHolder.trim() || null, 0, t('bank.previewNote'))
    : null
);
watch(src, () => (failed.value = false));
</script>

<template>
  <div v-if="src" class="space-y-2">
    <UButton size="xs" color="neutral" variant="soft" :icon="open ? 'i-lucide-eye-off' : 'i-lucide-qr-code'" @click="open = !open">
      {{ t(open ? 'bank.hide' : 'bank.preview') }}
    </UButton>
    <template v-if="open">
      <img v-if="!failed" :src="src" :alt="t('bill.qrAlt')" class="w-48 max-w-full rounded-xl bg-white shadow-sm" @error="failed = true" />
      <UAlert v-else color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="t('bank.failed')" />
      <p class="text-xs text-muted">{{ t('bank.previewHint') }}</p>
    </template>
  </div>
</template>
