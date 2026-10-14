<script setup lang="ts">
// Shown once after a new event's share dialog closes, and only to a creator with no PIN: without one, the personal sign-in link is the only way back in as organizer.
const open = defineModel<boolean>('open', { required: true });
const { t } = useI18n();
const toast = useToast();
const { me, refreshMe } = useMe();

const pin = ref('');
const busy = ref(false);
watch(pin, (v) => (pin.value = v.replace(/\D/g, '')));
const problem = computed(() => (pin.value.length === PIN_LENGTH ? pinProblem(pin.value) : null));
async function savePin() {
  busy.value = true;
  try {
    await $fetch('/api/me/pin', { method: 'POST', body: { pin: pin.value } });
    pin.value = '';
    await refreshMe();
    toast.add({ title: t('pin.saved') });
    open.value = false;
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    busy.value = false;
  }
}

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
      <form class="mt-3 flex gap-2" @submit.prevent="savePin">
        <UInput v-model="pin" type="password" inputmode="numeric" autocomplete="new-password" :maxlength="PIN_LENGTH" :placeholder="t('pin.choose')" :aria-label="t('pin.label')" class="flex-1" />
        <UButton type="submit" :loading="busy" :disabled="pin.length !== PIN_LENGTH || !!problem">{{ t('pin.save') }}</UButton>
      </form>
      <p class="mt-1 text-xs" :class="problem ? 'text-error' : 'text-muted'">{{ problem ? t('pin.weak') : t('pin.hintNew') }}</p>
      <p class="mt-4 text-sm text-muted">{{ t('keep.linkInstead') }}</p>
      <div v-if="manual" class="mt-3">
        <p class="mb-1 text-sm">{{ t('keep.manual') }}</p>
        <UInput :model-value="link" readonly class="w-full" @focus="(e: FocusEvent) => (e.target as HTMLInputElement).select()" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">{{ t('keep.later') }}</UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-link" :loading="loading" @click="copy">{{ t('keep.copy') }}</UButton>
      </div>
    </template>
  </UModal>
</template>
