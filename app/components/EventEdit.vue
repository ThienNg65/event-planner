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
const reopenTo = ref<(typeof STAGES)[number] | undefined>();
const confirm = ref<'reopen' | 'cancel' | 'delete' | null>(null);
const cancelReason = ref('');
// Fresh copy of the event every time the panel opens, so it never shows stale values.
watch(open, (o) => {
  if (!o) return;
  form.value = blank();
  reopenTo.value = undefined;
  confirm.value = null;
  cancelReason.value = '';
});
const earlier = computed(() => STAGES.slice(0, STAGES.indexOf(ev.value.stage)).map((s) => ({ label: t(`stage.${s}`), value: s })));

async function patch(body: object) {
  if (!(await call('', 'PATCH', body))) return false;
  emit('changed');
  return true;
}

async function save() {
  const { startsAt, pollDays, billTotal, voteDeadline, ...f } = form.value;
  const e = ev.value;
  const dateMoved = !!startsAt && !!e.startsAt && startsAt !== toTeamInput(e.startsAt);
  const venueMoved = !!f.venue && f.venue !== (e.venue ?? '');
  const startsAtIso = startsAt && teamTime(...(startsAt.split('T') as [string, string]));
  const ok = await patch({
    ...f,
    capacity: f.capacity || null,
    ...(editingDays.value ? { pollDays } : startsAt && { startsAt: startsAtIso }),
    ...(e.stage === 'poll' && { voteDeadline: voteDeadline ? teamTime(...(voteDeadline.split('T') as [string, string])) : null }),
    ...(e.stage !== 'poll' && { billTotal: billTotal ?? null }),
    // Entering the bill while RSVP is open moves on to splitting it.
    ...(e.stage === 'rsvp' && billTotal != null && { stage: 'bill' }),
  });
  if (!ok) return;
  open.value = false;
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

// The co-host key is only shown once (we store its hash), so creating or rotating copies the new link straight away.
async function newCoHostLink() {
  try {
    const { key } = await $fetch<{ key: string }>(`/api/events/${ev.value.id}/cohost`, { method: 'POST', headers: { 'x-manage-key': props.manageKey } });
    await navigator.clipboard.writeText(`${origin()}?key=${key}`);
    toast.add({ title: t('edit.cohostCopied'), description: t('edit.cohostHint') });
    emit('changed');
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
}

async function revokeCoHost() {
  if (await call('/cohost', 'DELETE')) emit('changed');
}

async function remove() {
  if (await call('', 'DELETE')) await navigateTo('/');
}
</script>

<template>
  <USlideover v-model:open="open" :title="t('edit.title')" :description="t('edit.description')">
    <template #body>
      <form v-if="!ev.cancelledAt" id="edit-event" class="space-y-6" @submit.prevent="save">
        <section class="space-y-3">
          <UFormField :label="t('create.name')" required>
            <UInput v-model="form.title" :maxlength="100" class="w-full" />
          </UFormField>
          <UFormField :label="t('create.note')">
            <UTextarea v-model="form.note" :maxlength="500" :rows="3" class="w-full" />
          </UFormField>
          <UFormField :label="t('edit.notice')" :hint="t('edit.noticeHint')">
            <UTextarea v-model="form.notice" :maxlength="280" :rows="2" class="w-full" />
          </UFormField>
          <UFormField :label="t('create.where')">
            <div class="space-y-2">
              <UInput v-model="form.venue" :maxlength="100" :placeholder="t('create.venue')" class="w-full" />
              <UInput v-model="form.venueLink" type="url" :placeholder="t('create.venueLink')" class="w-full" />
            </div>
          </UFormField>
        </section>

        <UFormField :label="editingDays ? t('manage.pollDays') : t('manage.schedule')" :hint="editingDays ? t('manage.removeDayHint') : undefined">
          <PollDaysInput v-if="editingDays" v-model="form.pollDays" />
          <UInput v-else v-model="form.startsAt" type="datetime-local" class="w-full" />
        </UFormField>

        <UFormField v-if="ev.stage === 'poll'" :label="t('edit.deadline')" :hint="t('edit.deadlineHint')">
          <UInput v-model="form.voteDeadline" type="datetime-local" class="w-full" />
        </UFormField>

        <UFormField :label="t('create.capacity')" :hint="t('create.capacityHint')">
          <UInputNumber v-model="form.capacity" :min="1" :max="500" class="w-40" />
        </UFormField>

        <section class="space-y-3">
          <UFormField v-if="ev.stage !== 'poll'" :label="t('manage.bill')" :hint="ev.stage === 'rsvp' ? t('manage.billHint') : undefined">
            <UInputNumber v-model="form.billTotal" :min="0" :step="1000" :format-options="{ maximumFractionDigits: 0 }" class="w-48" />
          </UFormField>
          <UFormField :label="t('create.bank')" :hint="t('create.bankHint')">
            <div class="grid gap-2 sm:grid-cols-3">
              <UInput v-model="form.bankId" :placeholder="t('create.bankId')" />
              <UInput v-model="form.bankAccount" :placeholder="t('create.bankAccount')" inputmode="numeric" />
              <UInput v-model="form.bankHolder" :placeholder="t('create.bankHolder')" />
            </div>
          </UFormField>
        </section>

        <UFormField :label="t('cover.label')">
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
          <div class="flex flex-wrap gap-2">
            <UButton color="neutral" variant="outline" icon="i-lucide-user-plus" :loading="busy" @click="newCoHostLink">
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
              <UButton color="warning" :loading="busy" autofocus @click="reopen">{{ t('edit.reopenButton') }}</UButton>
              <UButton variant="ghost" color="neutral" @click="confirm = null">{{ t('cancel') }}</UButton>
            </template>
          </div>

          <UButton v-if="ev.cancelledAt" color="neutral" variant="outline" icon="i-lucide-undo-2" :loading="busy" @click="restore">{{ t('edit.restore') }}</UButton>
          <template v-else>
            <UButton v-if="confirm !== 'cancel'" color="warning" variant="soft" icon="i-lucide-ban" @click="confirm = 'cancel'">{{ t('edit.cancelEvent') }}</UButton>
            <div v-else class="space-y-2">
              <p class="text-sm">{{ t('edit.cancelConfirm') }}</p>
              <UInput v-model="cancelReason" :maxlength="200" :placeholder="t('edit.cancelReason')" class="w-full" />
              <div class="flex gap-2">
                <UButton color="warning" :loading="busy" autofocus @click="cancelEvent">{{ t('edit.cancelEvent') }}</UButton>
                <UButton variant="ghost" color="neutral" @click="confirm = null">{{ t('cancel') }}</UButton>
              </div>
            </div>
          </template>

          <UButton v-if="confirm !== 'delete'" color="error" variant="ghost" icon="i-lucide-trash-2" @click="confirm = 'delete'">
            {{ t('manage.delete') }}
          </UButton>
          <div v-else class="flex flex-wrap items-center gap-2">
            <span class="text-sm">{{ t('manage.deleteConfirm') }}</span>
            <UButton color="error" :loading="busy" autofocus @click="remove">{{ t('manage.delete') }}</UButton>
            <UButton variant="ghost" color="neutral" @click="confirm = null">{{ t('cancel') }}</UButton>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">{{ t('cancel') }}</UButton>
        <UButton v-if="!ev.cancelledAt" type="submit" form="edit-event" :loading="busy" :disabled="!form.title.trim() || (editingDays && !form.pollDays.length)">{{ t('edit.save') }}</UButton>
      </div>
    </template>
  </USlideover>
</template>
