<script setup lang="ts">
const props = defineProps<{ data: EventDetail; manageKey: string }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const { call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const STAGES = ['poll', 'rsvp', 'bill', 'settled'] as const;
const ev = computed(() => props.data.event);
const earlier = computed(() => STAGES.slice(0, STAGES.indexOf(ev.value.stage)).map((s) => ({ label: t(`stage.${s}`), value: s })));

const view = ref<'reopen' | 'cancel' | 'delete' | null>(null);
const open = computed({
  get: () => view.value !== null,
  set: (v) => {
    if (!v) view.value = null;
  },
});
const reopenTo = ref<(typeof STAGES)[number] | undefined>();
const reason = ref('');
const error = ref('');
const busy = ref(false);

function show(v: 'reopen' | 'cancel' | 'delete') {
  reopenTo.value = undefined;
  reason.value = '';
  error.value = '';
  view.value = v;
}

const items = computed(() => [
  [
    ...(!ev.value.cancelledAt && earlier.value.length ? [{ label: t('host.reopen'), icon: 'i-lucide-history', onSelect: () => show('reopen') }] : []),
    ev.value.cancelledAt
      ? { label: t('edit.restore'), icon: 'i-lucide-undo-2', onSelect: restore }
      : { label: t('host.cancel'), icon: 'i-lucide-ban', onSelect: () => show('cancel') },
  ],
  [{ label: t('host.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => show('delete') }],
]);

// Each confirm shows its own failure inline and stays open, so nothing typed is lost.
async function run(method: 'PATCH' | 'DELETE', body?: object) {
  busy.value = true;
  error.value = '';
  try {
    await $fetch(`/api/events/${ev.value.id}`, { method, body, headers: { 'x-manage-key': props.manageKey } });
    return true;
  } catch (e) {
    error.value = errMsg(e);
    return false;
  } finally {
    busy.value = false;
  }
}

async function confirm() {
  const v = view.value;
  if (v === 'delete') {
    if (await run('DELETE')) await navigateTo('/');
    return;
  }
  const body = v === 'reopen' ? { stage: reopenTo.value } : { cancel: reason.value };
  if (!(await run('PATCH', body))) return;
  view.value = null;
  emit('changed');
}

async function restore() {
  if (await call('', 'PATCH', { restore: true })) emit('changed');
}

// Reka would focus the first control; the safe choice (Cancel) must get the focus instead.
const cancelBtn = useTemplateRef<{ $el: HTMLElement }>('cancelBtn');
function focusCancel(e: Event) {
  e.preventDefault();
  cancelBtn.value?.$el.focus();
}
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" :aria-label="t('host.menu')" />
  </UDropdownMenu>

  <UModal
    v-model:open="open"
    :title="view ? t(`host.${view}Title`) : ''"
    :description="view ? t(`host.${view}Body`) : ''"
    :content="{ onOpenAutoFocus: focusCancel }"
  >
    <template #body>
      <div class="space-y-3">
        <USelect v-if="view === 'reopen'" v-model="reopenTo" :items="earlier" :placeholder="t('edit.reopen')" class="w-full" />
        <UInput v-else-if="view === 'cancel'" v-model="reason" :maxlength="200" :placeholder="t('edit.cancelReason')" class="w-full" />
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="open = false">{{ t('cancel') }}</UButton>
        <UButton :color="view === 'delete' ? 'error' : 'warning'" :loading="busy" :disabled="view === 'reopen' && !reopenTo" @click="confirm">
          {{ view ? t(`host.${view}Button`) : '' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
