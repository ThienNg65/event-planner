<script setup lang="ts">
import { HOST_MORE } from '~/composables/useHostMore';

const props = defineProps<{ data: EventDetail; manageKey: string | null; role: Role }>();
const emit = defineEmits<{ changed: []; edit: []; post: []; organizers: [] }>();
const { t } = useI18n();
const { call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const STAGES = ['poll', 'rsvp', 'bill', 'settled'] as const;
const ev = computed(() => props.data.event);
const earlier = computed(() => STAGES.slice(0, STAGES.indexOf(ev.value.stage)).map((s) => ({ label: t(`stage.${s}`), value: s })));

const { meId } = useMe();
// A dot on the menu until it has been opened once on this browser.
const HINT = 'te:hint:manage';
const hint = ref(false);
onMounted(() => {
  try {
    hint.value = !localStorage.getItem(HINT);
  } catch {
    /* storage blocked: no dot */
  }
});
function seen() {
  hint.value = false;
  try {
    localStorage.setItem(HINT, '1');
  } catch {
    /* the dot may come back */
  }
}
const view = ref<'reopen' | 'cancel' | 'delete' | 'handover' | null>(null);
const open = computed({
  get: () => view.value !== null,
  set: (v) => {
    if (!v) view.value = null;
  },
});
const reopenTo = ref<(typeof STAGES)[number] | undefined>();
const reason = ref('');
const handTo = ref<number | undefined>();
const options = computed(() => props.data.handoverOptions.map((c) => ({ label: c.name, value: c.memberId })));
// Reopening to the poll also decides how voting restarts.
const voting = reactive({ mode: 'none' as 'none' | 'date', when: '' });
const votingDeadline = computed(() => (voting.mode === 'date' && voting.when ? teamTime(...(voting.when.split('T') as [string, string])) : null));
const votingInvalid = computed(() => reopenTo.value === 'poll' && voting.mode === 'date' && (!votingDeadline.value || new Date(votingDeadline.value).getTime() <= Date.now()));
// Going back to the poll clears unpaid derived answers; payments are never touched, so the host has to acknowledge them.
const derivedCount = computed(() => props.data.responses.filter((r) => r.derived && !r.paidAt).length);
const payers = computed(() =>
  props.data.responses
    .filter((r) => r.paidAt || (r.paidAmount ?? 0) > 0)
    .map((r) => ({ name: r.name, paid: paymentOf(r, (props.data.share ?? 0) * (1 + r.guests)).paid }))
);
const ack = ref(false);
const needsAck = computed(() => reopenTo.value === 'poll' && payers.value.length > 0);
const error = ref('');
const busy = ref(false);

function show(v: 'reopen' | 'cancel' | 'delete' | 'handover') {
  reopenTo.value = undefined;
  handTo.value = undefined;
  reason.value = '';
  ack.value = false;
  Object.assign(voting, { mode: 'none', when: '' });
  error.value = '';
  view.value = v;
}

// The next-step card's secondary moves for this stage (close voting, preview, complete...), owned by EventNextStep.
const stageMoves = inject(HOST_MORE, null);

// The one organizer menu: this stage's moves, then what a co-host may do, then what only the host may.
const items = computed(() => {
  const cancelled = !!ev.value.cancelledAt;
  const groups = [];
  if (stageMoves?.value.length) groups.push(stageMoves.value);
  const more = [
    ...(!cancelled && earlier.value.length ? [{ label: t('host.reopen'), icon: 'i-lucide-history', onSelect: () => show('reopen') }] : []),
    // Only the signed-in creator can hand the event over (a manage link alone cannot).
    ...(meId.value === ev.value.createdBy && !cancelled ? [{ label: t('host.handover'), icon: 'i-lucide-key-round', onSelect: () => show('handover') }] : []),
  ];
  if (can(props.role, 'edit') && !cancelled) {
    groups.push([
      { label: t('edit.open'), icon: 'i-lucide-pencil', onSelect: () => emit('edit') },
      { label: t(ev.value.notice ? 'post.edit' : 'post.open'), icon: 'i-lucide-megaphone', onSelect: () => emit('post') },
    ]);
  }
  groups.push([
    { label: t('org.title'), icon: 'i-lucide-shield-check', onSelect: () => emit('organizers') },
    { label: t('event.duplicate'), icon: 'i-lucide-copy', to: `/new?from=${ev.value.id}` },
  ]);
  if (can(props.role, 'cancel')) {
    groups.push([
      cancelled ? { label: t('edit.restore'), icon: 'i-lucide-undo-2', onSelect: restore } : { label: t('host.cancel'), icon: 'i-lucide-ban', onSelect: () => show('cancel') },
      // The rarely used moves sit one level down, so the menu stays short.
      ...(more.length ? [{ label: t('manage.more'), icon: 'i-lucide-ellipsis', children: more }] : []),
    ]);
    groups.push([{ label: t('host.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => show('delete') }]);
  }
  return groups;
});

// Each confirm shows its own failure inline and stays open, so nothing typed is lost.
async function run(method: 'PATCH' | 'DELETE', body?: object) {
  busy.value = true;
  error.value = '';
  try {
    await $fetch(`/api/events/${ev.value.id}`, { method, body, headers: props.manageKey ? { 'x-manage-key': props.manageKey } : {} });
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
  if (v === 'handover') {
    busy.value = true;
    error.value = '';
    try {
      await $fetch(`/api/events/${ev.value.id}/handover`, { method: 'POST', body: { to: handTo.value } });
    } catch (e) {
      error.value = errMsg(e);
      return;
    } finally {
      busy.value = false;
    }
    view.value = null;
    emit('changed');
    return;
  }
  const reopening = reopenTo.value === 'poll' ? { reopenVoting: true, voteDeadline: votingDeadline.value, ...(needsAck.value && { acknowledgePayments: true }) } : {};
  const body = v === 'reopen' ? { stage: reopenTo.value, ...reopening } : { cancel: reason.value };
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
  <UDropdownMenu :items="items" :content="{ align: 'end' }" @update:open="seen">
    <UChip :show="hint" inset>
      <UButton icon="i-lucide-settings-2" trailing-icon="i-lucide-chevron-down" color="neutral" variant="outline" :aria-label="t('manage.menu')">
        <span class="hidden sm:inline">{{ t('manage.menu') }}</span>
      </UButton>
    </UChip>
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
        <UFormField v-if="view === 'reopen' && reopenTo === 'poll'" :label="t('host.votingChoice')">
          <div class="space-y-2">
            <URadioGroup v-model="voting.mode" :items="[{ value: 'none', label: t('next.reopenNone') }, { value: 'date', label: t('next.reopenDate') }]" />
            <DateTimeInput v-if="voting.mode === 'date'" v-model="voting.when" class="w-full" :aria-label="t('next.reopenDate')" />
          </div>
        </UFormField>
        <div v-if="view === 'reopen' && reopenTo === 'poll'" class="space-y-2 text-sm">
          <p v-if="derivedCount" class="text-muted">{{ t('host.reopenDerived', { n: derivedCount }, derivedCount) }}</p>
          <template v-if="payers.length">
            <UAlert color="warning" variant="subtle" icon="i-lucide-wallet" :title="t('host.reopenPayments')" :description="payers.map((p) => `${p.name} ${fmtVnd(p.paid)}`).join(', ')" />
            <UCheckbox v-model="ack" :label="t('host.reopenAck')" />
          </template>
        </div>
        <template v-else-if="view === 'handover'">
          <USelect v-if="options.length" v-model="handTo" :items="options" :placeholder="t('host.handoverPick')" class="w-full" />
          <p v-else class="text-sm text-muted">{{ t('host.handoverNone') }}</p>
          <p v-if="data.handover" class="text-sm text-muted">{{ t('host.handoverReplace', { name: data.handover.name }) }}</p>
        </template>
        <UInput v-else-if="view === 'cancel'" v-model="reason" :maxlength="200" :placeholder="t('edit.cancelReason')" class="w-full" />
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="open = false">{{ t('cancel') }}</UButton>
        <UButton :color="view === 'delete' ? 'error' : 'warning'" :loading="busy" :disabled="(view === 'reopen' && !reopenTo) || (view === 'handover' && !handTo) || votingInvalid || (needsAck && !ack)" @click="confirm">
          {{ view ? t(`host.${view}Button`) : '' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
