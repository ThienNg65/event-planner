<script setup lang="ts">
const props = defineProps<{ data: EventDetail }>();
const emit = defineEmits<{ changed: []; rekeyed: [key: string] }>();
const { t } = useI18n();
const toast = useToast();
const busy = ref(false);
const url = computed(() => `/api/events/${props.data.event.id}/handover`);

async function send(path: string, method: 'POST' | 'DELETE') {
  busy.value = true;
  try {
    return await $fetch<{ key?: string }>(`${url.value}${path}`, { method });
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
    // A stale offer (withdrawn, replaced, co-host removed) is gone: show the page as it is now.
    emit('changed');
  } finally {
    busy.value = false;
  }
}

async function accept() {
  const res = await send('/accept', 'POST');
  if (!res?.key) return;
  // The old co-host key is replaced by the manage key, which only this response ever shows.
  saveManageKey(props.data.event.id, res.key);
  emit('rekeyed', res.key);
  emit('changed');
  toast.add({ title: t('handover.accepted') });
}

async function cancel() {
  if (await send('', 'DELETE')) emit('changed');
}
</script>

<template>
  <UAlert
    v-if="data.handover?.mine"
    role="status"
    color="primary"
    variant="subtle"
    icon="i-lucide-key-round"
    :title="t('handover.offerTitle', { name: data.hostName })"
    :description="t('handover.offerBody')"
    :actions="[
      { label: t('handover.accept'), color: 'primary', loading: busy, onClick: accept },
      { label: t('handover.decline'), color: 'neutral', variant: 'outline', disabled: busy, onClick: cancel },
    ]"
  />
  <UAlert
    v-else-if="data.handover"
    role="status"
    color="neutral"
    variant="subtle"
    icon="i-lucide-key-round"
    :title="t('handover.pending', { name: data.handover.name })"
    :actions="[{ label: t('handover.cancel'), color: 'neutral', variant: 'outline', loading: busy, onClick: cancel }]"
  />
</template>
