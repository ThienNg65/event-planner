<script setup lang="ts">
const props = defineProps<{ data: EventDetail; manageKey: string; role: Role }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const toast = useToast();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const STAGES = ['poll', 'rsvp', 'bill', 'settled'] as const;
const ev = computed(() => props.data.event);
const isHost = computed(() => can(props.role, 'cancel'));
// A running date poll edits its candidate days; otherwise the fixed date and time.
const editingDays = computed(() => ev.value.stage === 'poll' && ev.value.pollDays.length > 0);

const blank = () => {
  const e = ev.value;
  return {
    title: e.title,
    note: e.note,
    notice: e.notice ?? '',
    venue: e.venue ?? '',
    venueLink: e.venueLink ?? '',
    startsAt: e.startsAt ? toTeamInput(e.startsAt) : '',
    voteDeadline: e.voteDeadline ? toTeamInput(e.voteDeadline) : '',
    pollDays: [...e.pollDays],
    capacity: e.capacity,
    billTotal: e.billTotal,
    bankId: e.bankId ?? '',
    bankAccount: e.bankAccount ?? '',
    bankHolder: e.bankHolder ?? '',
    cover: e.cover,
  };
};
const form = ref(blank());
// What the form held when the panel opened: the baseline for "unsaved" and for the fields a save sends.
const snapshot = ref(blank());
const changes = computed(() => changedFields(snapshot.value, form.value));
const dirty = computed(() => Object.keys(changes.value).length > 0);
const errors = ref<Record<string, string>>({});
const denied = ref(false);
const saving = ref(false);
const discarding = ref(false);
const reopenTo = ref<(typeof STAGES)[number] | undefined>();
const confirm = ref<'reopen' | 'cancel' | 'delete' | 'rotate' | null>(null);
const cancelReason = ref('');
const coHostLink = ref('');
// Fresh copy of the event every time the panel opens, so it never shows stale values.
watch(open, (o) => {
  if (!o) return;
  form.value = blank();
  snapshot.value = blank();
  errors.value = {};
  denied.value = false;
  discarding.value = false;
  reopenTo.value = undefined;
  confirm.value = null;
  cancelReason.value = '';
  coHostLink.value = '';
});
// A confirm row opens with focus on Cancel, never on the destructive button.
const cancelBtn = useTemplateRef<{ $el: HTMLElement }>('cancelBtn');
watch(confirm, async (c) => {
  if (!c) return;
  await nextTick();
  cancelBtn.value?.$el.focus();
});
watch(form, () => (errors.value = {}), { deep: true });
const earlier = computed(() => STAGES.slice(0, STAGES.indexOf(ev.value.stage)).map((s) => ({ label: t(`stage.${s}`), value: s })));

async function patch(body: object) {
  if (!(await call('', 'PATCH', body))) return false;
  emit('changed');
  return true;
}

// Which form field a server error code belongs under.
const FIELD_OF: Record<string, string> = {
  titleRequired: 'title',
  invalidLink: 'venueLink',
  invalidCapacity: 'capacity',
  invalidBank: 'bank',
  invalidCover: 'cover',
};

async function save() {
  const { startsAt, voteDeadline, pollDays, billTotal, ...f } = changes.value;
  const e = ev.value;
  const startsAtIso = startsAt && teamTime(...(startsAt.split('T') as [string, string]));
  const body = {
    ...f,
    ...(pollDays && { pollDays }),
    ...(startsAtIso && { startsAt: startsAtIso }),
    ...('voteDeadline' in changes.value && { voteDeadline: voteDeadline ? teamTime(...(voteDeadline.split('T') as [string, string])) : null }),
    ...('billTotal' in changes.value && { billTotal: billTotal ?? null }),
    // Entering (or changing) the bill while RSVP is open moves on to splitting it; a bill kept from a reopen does not.
    ...(e.stage === 'rsvp' && billTotal != null && { stage: 'bill' }),
  };
  if (!Object.keys(body).length) return;
  saving.value = true;
  errors.value = {};
  try {
    await $fetch(`/api/events/${e.id}`, { method: 'PATCH', body, headers: { 'x-manage-key': props.manageKey } });
  } catch (err) {
    onSaveError(err, 'voteDeadline' in body);
    return;
  } finally {
    saving.value = false;
  }
  const dateMoved = !!startsAtIso && !!e.startsAt && startsAt !== toTeamInput(e.startsAt);
  const venueMoved = !!f.venue && f.venue !== (e.venue ?? '');
  snapshot.value = { ...form.value };
  open.value = false;
  emit('changed');
  // Once people have answered, offer to tell them about a changed date or venue.
  if (e.stage !== 'poll' && (dateMoved || venueMoved)) {
    const text = [
      dateMoved && t('notice.moved', { when: fmtDateTime(startsAtIso as string, locale.value) }),
      venueMoved && t('notice.venue', { venue: f.venue }),
    ]
      .filter(Boolean)
      .join(' ');
    toast.add({
      title: t('edit.letKnow'),
      description: text,
      actions: [{ label: t('edit.postUpdate'), onClick: async () => void (await patch({ notice: text })) }],
    });
  }
}

// A failed save leaves the form as it is. Field errors show next to the field; a lost key is explained and refreshed once the panel closes.
function onSaveError(err: unknown, deadlineSent: boolean) {
  const status = (err as { statusCode?: number }).statusCode;
  const code = (err as { data?: { statusMessage?: string } }).data?.statusMessage ?? '';
  if (status === 403) {
    denied.value = true;
    return;
  }
  let field = FIELD_OF[code];
  if (code === 'invalidDate') field = deadlineSent ? 'voteDeadline' : 'startsAt';
  if (field) errors.value = { [field]: errMsg(err) };
  else toast.add({ color: 'error', title: errMsg(err) });
}

// Closing with unsaved edits asks first; "Keep editing" is focused.
function tryClose() {
  if (dirty.value) discarding.value = true;
  else open.value = false;
}

// Reka would focus the first control; the safe choice must get the focus instead.
const keepBtn = useTemplateRef<{ $el: HTMLElement }>('keepBtn');
function focusKeep(e: Event) {
  e.preventDefault();
  keepBtn.value?.$el.focus();
}

function discard() {
  discarding.value = false;
  open.value = false;
}

// The key stopped working (e.g. the co-host link was revoked): refresh only after the panel closes, or the page would drop it with the edits.
watch(open, (o) => {
  if (!o && denied.value) emit('changed');
});

// Leaving the page (a link, back) or closing the tab with unsaved edits.
onBeforeRouteLeave(() => !(open.value && dirty.value) || window.confirm(t('edit.discardBody')));
function warnUnload(e: BeforeUnloadEvent) {
  if (open.value && dirty.value) e.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', warnUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnUnload));
async function reopen() {
  if (reopenTo.value && (await patch({ stage: reopenTo.value }))) open.value = false;
}

async function cancelEvent() {
  if (await patch({ cancel: cancelReason.value })) open.value = false;
}

async function restore() {
  if (await patch({ restore: true })) open.value = false;
}

const origin = () => `${location.origin}/e/${ev.value.id}`;
async function copyLink() {
  await navigator.clipboard.writeText(`${origin()}?key=${props.manageKey}`);
  toast.add({ title: t('manage.linkCopied'), description: t('manage.linkHint') });
}

// The co-host key is only shown once (we store its hash), so the new link stays on screen until the panel closes.
// Copying is a separate tap: Safari rejects clipboard writes that follow an await.
async function newCoHostLink() {
  try {
    const { key } = await $fetch<{ key: string }>(`/api/events/${ev.value.id}/cohost`, { method: 'POST', headers: { 'x-manage-key': props.manageKey } });
    coHostLink.value = `${origin()}?key=${key}`;
    confirm.value = null;
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

async function remove() {
  if (await call('', 'DELETE')) await navigateTo('/');
}
</script>

<template>
  <USlideover v-model:open="open" :title="t('edit.title')" :description="t('edit.description')" :dismissible="!dirty" :close="false" @close:prevent="tryClose">
    <template #actions>
      <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('close')" @click="tryClose" />
    </template>
    <template #body>
      <form v-if="!ev.cancelledAt" id="edit-event" class="space-y-6" @submit.prevent="save">
        <UAlert v-if="denied" color="error" variant="subtle" icon="i-lucide-shield-x" :title="t('edit.noAccess')" :description="t('edit.noAccessHint')" />
        <section class="space-y-3">
          <UFormField :label="t('create.name')" required :error="errors.title">
            <UInput v-model="form.title" :maxlength="100" class="w-full" />
          </UFormField>
          <UFormField :label="t('create.note')">
            <UTextarea v-model="form.note" :maxlength="500" :rows="3" class="w-full" />
          </UFormField>
          <UFormField :label="t('edit.notice')" :hint="t('edit.noticeHint')">
            <UTextarea v-model="form.notice" :maxlength="280" :rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('create.where')" :error="errors.venueLink">
            <div class="space-y-2">
              <UInput v-model="form.venue" :maxlength="100" :placeholder="t('create.venue')" class="w-full" />
              <UInput v-model="form.venueLink" type="url" :placeholder="t('create.venueLink')" class="w-full" />
            </div>
          </UFormField>
        </section>

        <UFormField :label="editingDays ? t('manage.pollDays') : t('manage.schedule')" :hint="editingDays ? t('manage.removeDayHint') : undefined" :error="errors.startsAt">
          <PollDaysInput v-if="editingDays" v-model="form.pollDays" />
          <UInput v-else v-model="form.startsAt" type="datetime-local" class="w-full" />
        </UFormField>

        <UFormField v-if="ev.stage === 'poll'" :label="t('edit.deadline')" :hint="t('edit.deadlineHint')" :error="errors.voteDeadline">
          <UInput v-model="form.voteDeadline" type="datetime-local" class="w-full" />
        </UFormField>

        <UFormField :label="t('create.capacity')" :hint="t('create.capacityHint')" :error="errors.capacity">
          <UInputNumber v-model="form.capacity" :min="1" :max="500" class="w-40" />
        </UFormField>

        <section class="space-y-3">
          <UFormField v-if="ev.stage !== 'poll'" :label="t('manage.bill')" :hint="ev.stage === 'rsvp' ? t('manage.billHint') : undefined">
            <UInputNumber v-model="form.billTotal" :min="0" :step="1000" :format-options="{ maximumFractionDigits: 0 }" class="w-48" />
          </UFormField>
          <UFormField :label="t('create.bank')" :hint="t('create.bankHint')" :error="errors.bank">
            <div class="grid gap-2 sm:grid-cols-3">
              <UInput v-model="form.bankId" :placeholder="t('create.bankId')" />
              <UInput v-model="form.bankAccount" :placeholder="t('create.bankAccount')" inputmode="numeric" />
              <UInput v-model="form.bankHolder" :placeholder="t('create.bankHolder')" />
            </div>
          </UFormField>
        </section>

        <UFormField :label="t('cover.label')" :error="errors.cover">
          <CoverPicker v-model="form.cover" />
        </UFormField>
      </form>
      <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-ban" :title="t('edit.cancelledNote')" />

      <div v-if="isHost" class="mt-8 space-y-6 border-t border-default pt-6">
        <div class="space-y-2">
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
          <div v-if="confirm === 'rotate'" class="flex flex-wrap items-center gap-2">
            <span class="text-sm">{{ t('edit.cohostRotateConfirm') }}</span>
            <UButton color="warning" :loading="busy" @click="newCoHostLink">{{ t('edit.cohostNew') }}</UButton>
            <UButton variant="ghost" color="neutral" ref="cancelBtn" @click="confirm = null">{{ t('cancel') }}</UButton>
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <UButton color="neutral" variant="outline" icon="i-lucide-user-plus" :loading="busy" @click="data.hasCoHost ? (confirm = 'rotate') : newCoHostLink()">
              {{ data.hasCoHost ? t('edit.cohostNew') : t('edit.cohostCreate') }}
            </UButton>
            <UButton v-if="data.hasCoHost" color="neutral" variant="ghost" :loading="busy" @click="revokeCoHost">{{ t('edit.cohostRevoke') }}</UButton>
          </div>
        </div>

        <div class="space-y-3 rounded-lg p-3 ring ring-error/30">
          <p class="text-sm font-semibold text-error">{{ t('edit.danger') }}</p>

          <div v-if="!ev.cancelledAt && earlier.length" class="flex flex-wrap items-center gap-2">
            <USelect v-model="reopenTo" :items="earlier" :placeholder="t('edit.reopen')" class="min-w-44" />
            <UButton v-if="confirm !== 'reopen'" color="warning" variant="soft" :disabled="!reopenTo" @click="confirm = 'reopen'">
              {{ t('edit.reopenButton') }}
            </UButton>
            <template v-else>
              <span class="text-sm">{{ t('edit.reopenConfirm') }}</span>
              <UButton color="warning" :loading="busy" @click="reopen">{{ t('edit.reopenButton') }}</UButton>
              <UButton variant="ghost" color="neutral" ref="cancelBtn" @click="confirm = null">{{ t('cancel') }}</UButton>
            </template>
          </div>

          <UButton v-if="ev.cancelledAt" color="neutral" variant="outline" icon="i-lucide-undo-2" :loading="busy" @click="restore">{{ t('edit.restore') }}</UButton>
          <template v-else>
            <UButton v-if="confirm !== 'cancel'" color="warning" variant="soft" icon="i-lucide-ban" @click="confirm = 'cancel'">{{ t('edit.cancelEvent') }}</UButton>
            <div v-else class="space-y-2">
              <p class="text-sm">{{ t('edit.cancelConfirm') }}</p>
              <UInput v-model="cancelReason" :maxlength="200" :placeholder="t('edit.cancelReason')" class="w-full" />
              <div class="flex gap-2">
                <UButton color="warning" :loading="busy" @click="cancelEvent">{{ t('edit.cancelEvent') }}</UButton>
                <UButton variant="ghost" color="neutral" ref="cancelBtn" @click="confirm = null">{{ t('cancel') }}</UButton>
              </div>
            </div>
          </template>

          <UButton v-if="confirm !== 'delete'" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirm = 'delete'">
            {{ t('manage.delete') }}
          </UButton>
          <div v-else class="flex flex-wrap items-center gap-2">
            <span class="text-sm">{{ t('manage.deleteConfirm') }}</span>
            <UButton color="error" :loading="busy" @click="remove">{{ t('manage.delete') }}</UButton>
            <UButton variant="ghost" color="neutral" ref="cancelBtn" @click="confirm = null">{{ t('cancel') }}</UButton>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <p v-if="dirty" role="status" class="mr-auto flex items-center gap-1.5 text-sm text-warning"><UIcon name="i-lucide-circle-dot" class="size-4" />{{ t('edit.unsaved') }}</p>
        <UButton color="neutral" variant="ghost" @click="tryClose">{{ t('cancel') }}</UButton>
        <UButton v-if="!ev.cancelledAt" type="submit" form="edit-event" :loading="saving" :disabled="!dirty || !form.title.trim() || (editingDays && !form.pollDays.length)">{{ t('edit.save') }}</UButton>
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="discarding" :title="t('edit.discardTitle')" :description="t('edit.discardBody')" :close="false" :content="{ onOpenAutoFocus: focusKeep }">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="discard">{{ t('edit.discard') }}</UButton>
        <UButton ref="keepBtn" @click="discarding = false">{{ t('edit.keepEditing') }}</UButton>
      </div>
    </template>
  </UModal>
</template>
