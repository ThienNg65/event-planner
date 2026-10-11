<script setup lang="ts">
const props = defineProps<{ data: EventDetail; manageKey: string; role: Role }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const toast = useToast();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const isHost = computed(() => can(props.role, 'cohost'));
// What each role may do, read from the same table the server uses.
const ROWS: { key: string; action?: Action }[] = [
  { key: 'answer' },
  { key: 'edit', action: 'edit' },
  { key: 'advance', action: 'advance' },
  { key: 'removeVenue', action: 'removeVenue' },
  { key: 'setOthers', action: 'setOthers' },
  { key: 'reopen', action: 'reopen' },
  { key: 'cancel', action: 'cancel' },
  { key: 'cohost', action: 'cohost' },
];
const COLUMNS: { role: Role; label: string }[] = [
  { role: 'host', label: 'org.host' },
  { role: 'cohost', label: 'org.cohost' },
  { role: null, label: 'org.participant' },
];
const allowed = (role: Role, action?: Action) => !action || can(role, action);

// Full screen on phones.
const phone = ref(false);
onMounted(() => {
  const mq = window.matchMedia('(max-width: 639px)');
  phone.value = mq.matches;
  mq.addEventListener('change', (e) => (phone.value = e.matches));
});

const confirming = ref(false);
const coHostLink = ref('');
// The co-host key is only shown once (we store its hash), so the new link stays on screen until the dialog closes.
watch(open, (o) => {
  if (!o) return;
  confirming.value = false;
  coHostLink.value = '';
});
// The confirm opens with focus on Cancel, never on the destructive button.
const cancelBtn = useTemplateRef<{ $el: HTMLElement }>('cancelBtn');
watch(confirming, async (c) => {
  if (!c) return;
  await nextTick();
  cancelBtn.value?.$el.focus();
});

const origin = () => `${location.origin}/e/${props.data.event.id}`;
async function copyLink() {
  await navigator.clipboard.writeText(`${origin()}?key=${props.manageKey}`);
  toast.add({ title: t('manage.linkCopied'), description: t('manage.linkHint') });
}

// Copying is a separate tap: Safari rejects clipboard writes that follow an await.
async function newCoHostLink() {
  try {
    const { key } = await $fetch<{ key: string }>(`/api/events/${props.data.event.id}/cohost`, { method: 'POST', headers: { 'x-manage-key': props.manageKey } });
    coHostLink.value = `${origin()}?key=${key}`;
    confirming.value = false;
    emit('changed');
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
}

async function copyCoHostLink() {
  try {
    await navigator.clipboard.writeText(coHostLink.value);
    toast.add({ title: t('edit.cohostCopied'), description: t('edit.cohostHint') });
  } catch {
    /* clipboard blocked: the link is still shown to copy by hand */
  }
}

async function revokeCoHost() {
  if (!(await call('/cohost', 'DELETE'))) return;
  coHostLink.value = '';
  emit('changed');
}
</script>

<template>
  <UModal v-model:open="open" :title="t('org.title')" :description="t('org.description')" :fullscreen="phone">
    <template #body>
      <div class="space-y-6">
        <p class="text-sm">
          {{ t('org.yourRole') }} <UBadge :color="role === 'host' ? 'primary' : 'neutral'" variant="subtle" :label="t(role === 'host' ? 'org.host' : 'org.cohost')" />
        </p>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs text-muted">
                <th scope="col" class="py-2 pr-2 font-medium">{{ t('org.can') }}</th>
                <th v-for="c in COLUMNS" :key="c.label" scope="col" class="px-2 py-2 text-center font-medium">{{ t(c.label) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ROWS" :key="r.key" class="border-b border-default/60">
                <th scope="row" class="py-2 pr-2 text-left font-normal">{{ t(`org.rows.${r.key}`) }}</th>
                <td v-for="c in COLUMNS" :key="c.label" class="px-2 py-2 text-center">
                  <template v-if="allowed(c.role, r.action)">
                    <UIcon name="i-lucide-check" class="size-4 text-success" /><span class="sr-only">{{ t('org.yes') }}</span>
                  </template>
                  <template v-else>
                    <UIcon name="i-lucide-minus" class="size-4 text-dimmed" /><span class="sr-only">{{ t('org.no') }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <template v-if="isHost">
          <div class="space-y-2 border-t border-default pt-6">
            <UButton color="neutral" variant="outline" icon="i-lucide-key-round" @click="copyLink">{{ t('manage.copyLink') }}</UButton>
            <p class="text-xs text-muted">{{ t('manage.linkHint') }}</p>
          </div>

          <div class="space-y-2">
            <p class="text-sm font-semibold">{{ t('edit.cohost') }}</p>
            <p class="text-xs text-muted">{{ t('edit.cohostHint') }}</p>
            <p v-if="data.hasCoHost" class="flex items-center gap-1.5 text-sm text-success"><UIcon name="i-lucide-circle-check" class="size-4" />{{ t('edit.cohostActive') }}</p>
            <div v-if="coHostLink" class="flex gap-2">
              <UInput :model-value="coHostLink" readonly class="min-w-0 flex-1" />
              <UButton color="neutral" variant="outline" icon="i-lucide-copy" :aria-label="t('edit.cohostCopy')" @click="copyCoHostLink" />
            </div>
            <div v-if="confirming" class="flex flex-wrap items-center gap-2">
              <span class="text-sm">{{ t('edit.cohostRotateConfirm') }}</span>
              <UButton color="warning" :loading="busy" @click="newCoHostLink">{{ t('edit.cohostNew') }}</UButton>
              <UButton ref="cancelBtn" variant="ghost" color="neutral" @click="confirming = false">{{ t('cancel') }}</UButton>
            </div>
            <div v-else class="flex flex-wrap gap-2">
              <UButton color="neutral" variant="outline" icon="i-lucide-user-plus" :loading="busy" @click="data.hasCoHost ? (confirming = true) : newCoHostLink()">
                {{ data.hasCoHost ? t('edit.cohostNew') : t('edit.cohostCreate') }}
              </UButton>
              <UButton v-if="data.hasCoHost" color="neutral" variant="ghost" :loading="busy" @click="revokeCoHost">{{ t('edit.cohostRevoke') }}</UButton>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
