<script setup lang="ts">
// Shown once after a new event's share dialog closes: the personal sign-in link, kept apart from sharing on purpose.
const open = defineModel<boolean>('open', { required: true });
const { t } = useI18n();
const toast = useToast();
const { me } = useMe();

// Fetched when the card opens: Safari rejects clipboard writes that follow an await.
const link = ref('');
const loading = ref(false);
async function load() {
  loading.value = true;
  try {
    const { token } = await $fetch('/api/me/link', { method: 'POST' });
    link.value = `${location.origin}/#signin=${token}`;
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    loading.value = false;
  }
}
watch(open, (o) => {
  if (o && !link.value) load();
});

const manual = ref(false);

// A failed fetch is retried here, then copied; a blocked clipboard (e.g. Safari after the await) shows the link to copy by hand.
async function copy() {
  if (!link.value) await load();
  if (!link.value) return;
  try {
    await navigator.clipboard.writeText(link.value);
    toast.add({ title: t('me.linkCopied') });
    open.value = false;
  } catch {
    manual.value = true;
    toast.add({ color: 'error', title: t('share.copyFailed') });
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('keep.title')" :description="t('keep.subtitle')">
    <template #body>
      <UAlert color="warning" variant="subtle" icon="i-lucide-key-round" :description="t('keep.body', { name: me?.name ?? '' })" />
      <p class="mt-3 text-sm text-muted">{{ t('keep.rotate') }}</p>
      <div v-if="manual" class="mt-3">
        <p class="mb-1 text-sm">{{ t('keep.manual') }}</p>
        <UInput :model-value="link" readonly class="w-full" @focus="(e: FocusEvent) => (e.target as HTMLInputElement).select()" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">{{ t('keep.later') }}</UButton>
        <UButton icon="i-lucide-link" :loading="loading" @click="copy">{{ t('keep.copy') }}</UButton>
      </div>
    </template>
  </UModal>
</template>
