<script setup lang="ts">
const props = defineProps<{ data: EventDetail; manageKey: string | null }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const toast = useToast();

const ev = computed(() => props.data.event);
const { members } = useMe();
// A running date poll has no fixed date to edit; its days change in the Edit days dialog.
const editingDays = computed(() => ev.value.stage === 'poll' && ev.value.pollDays.length > 0);

const blank = () => {
  const e = ev.value;
  return {
    title: e.title,
    note: e.note,
    venue: e.venue ?? '',
    venueLink: e.venueLink ?? '',
    startsAt: e.startsAt ? toTeamInput(e.startsAt) : '',
    voteDeadline: e.voteDeadline ? toTeamInput(e.voteDeadline) : '',
    capacity: e.capacity,
    maxGuests: guestLimit(e),
    hideVotes: e.hideVotes,
    repeat: e.repeat ?? 'none',
    repeatUntil: e.repeatUntil ?? '',
    billTotal: e.billTotal,
    bankId: e.bankId ?? '',
    bankAccount: e.bankAccount ?? '',
    bankHolder: e.bankHolder ?? '',
    cover: e.cover,
    theme: themeOf(e.theme),
    honorees: [...e.honorees],
  };
};
const form = ref(blank());
usePlaceName(
  () => form.value.venueLink,
  (name) => {
    if (!form.value.venue.trim()) form.value.venue = name;
  }
);
// Repeating needs a fixed date and a place; an event already in a series can always turn it off.
const canRepeat = computed(() => !!ev.value.repeat || (!!ev.value.startsAt && !ev.value.pollDays.length && !!ev.value.venue));
// What the form held when the panel opened: the baseline for "unsaved" and for the fields a save sends.
const snapshot = ref(blank());
const changes = computed(() => changedFields(snapshot.value, form.value));
const dirty = computed(() => Object.keys(changes.value).length > 0);
const errors = ref<Record<string, string>>({});
const denied = ref(false);
const saving = ref(false);
const discarding = ref(false);
const postUpdate = ref(true);
const updateText = ref('');
// Fresh copy of the event every time the panel opens, so it never shows stale values.
watch(open, (o) => {
  if (!o) return;
  form.value = blank();
  snapshot.value = blank();
  errors.value = {};
  denied.value = false;
  discarding.value = false;
  postUpdate.value = true;
});
watch(form, () => (errors.value = {}), { deep: true });

// What this save would do to people, shown before it happens.
const rows = computed(() => props.data.responses.map((r) => ({ ...r, goingAt: r.goingAt ? new Date(r.goingAt) : null, firstVotedAt: r.firstVotedAt ? new Date(r.firstVotedAt) : null })));
const queue = computed(() => seated(rows.value, ev.value));
const seatMoves = computed(() => ('capacity' in changes.value ? capacityImpact(queue.value, ev.value.capacity, changes.value.capacity ?? null) : null));
const names = (rs: { name: string }[]) => rs.map((r) => r.name).join(', ');
// Setting a place during the poll ends the place vote.
const endsPlaceVote = computed(() => ev.value.stage === 'poll' && !ev.value.venue && !!changes.value.venue && props.data.venues.length > 0);
const voteOpen = computed(() => votingOpen(ev.value));
// A bill is entered from the next step; here it can only be corrected once the cost is being split.
const billCorrectable = computed(() => ev.value.stage === 'bill' || ev.value.stage === 'settled');
const shareChange = computed(() => {
  if (!billCorrectable.value || !('billTotal' in changes.value)) return null;
  return { from: shareOf(ev.value.billTotal, props.data.seats), to: shareOf(changes.value.billTotal ?? null, props.data.seats) };
});
const fmtShare = (n: number | null) => (n === null ? t('edit.noShare') : fmtVnd(n));
// Once the event has started or the bill is in, date and place only change through a correction.
const frozen = computed(() => planFrozen(ev.value));
const correcting = ref(false);
// A moved date or place in the RSVP stage re-checks everyone counted from their votes: who stays, who is held, whose hold already ran out.
const rederive = computed(() => {
  const c = changes.value;
  if (ev.value.stage !== 'rsvp' || frozen.value || !('startsAt' in c || 'venue' in c) || !(ev.value.pollDays.length || props.data.venues.length)) return null;
  const startsAt = c.startsAt ? teamTime(...(c.startsAt.split('T') as [string, string])) : ev.value.startsAt;
  const plan = planFor(ev.value.pollDays, startsAt, props.data.venues, 'venue' in c ? (c.venue ?? null) : ev.value.venue);
  return deriveAttendance(rows.value, plan, 'edit', ev.value);
});
const reconfirmBy = ref('');
const reconfirmIso = computed(() => (reconfirmBy.value ? teamTime(...(reconfirmBy.value.split('T') as [string, string])) : ''));
// Once people have answered, a changed date or place can be announced with the save.
const startsAtIso = computed(() => {
  const v = changes.value.startsAt;
  return v ? teamTime(...(v.split('T') as [string, string])) : '';
});
const prefill = computed(() => {
  const e = ev.value;
  if (e.stage === 'poll') return '';
  const dateMoved = !!startsAtIso.value && !!e.startsAt && changes.value.startsAt !== toTeamInput(e.startsAt);
  return [
    dateMoved && t('notice.moved', { when: fmtDateTime(startsAtIso.value, locale.value) }),
    !!changes.value.venue && t('notice.venue', { venue: changes.value.venue }),
    !!rederive.value?.hold.length && !!reconfirmIso.value && t('notice.reconfirm', { deadline: fmtDateTime(reconfirmIso.value, locale.value) }),
  ]
    .filter(Boolean)
    .join(' ');
});
watch(prefill, (v) => (updateText.value = v), { immediate: true });
// Default confirm-by: two days from now, never after the new start.
// Only when holds first appear (or the field is empty), so a deadline the organizer typed is kept.
watch(
  () => [rederive.value?.hold.length ?? 0, startsAtIso.value] as const,
  ([holds], [before]) => {
    if (!holds) {
      reconfirmBy.value = '';
      return;
    }
    if (before && reconfirmBy.value) return;
    const start = startsAtIso.value ? new Date(startsAtIso.value).getTime() : Infinity;
    reconfirmBy.value = toTeamInput(new Date(Math.min(Date.now() + RECONFIRM_MS, start)).toISOString());
  }
);

// Which form field a server error code belongs under.
const FIELD_OF: Record<string, string> = {
  titleRequired: 'title',
  invalidLink: 'venueLink',
  invalidCapacity: 'capacity',
  invalidGuests: 'maxGuests',
  invalidBank: 'bank',
  invalidCover: 'cover',
  startsInPast: 'startsAt',
  invalidRepeat: 'repeat',
  repeatNeedsFixedPlan: 'repeat',
};

async function save() {
  const { startsAt, voteDeadline, billTotal, repeat, repeatUntil, ...f } = changes.value;
  const e = ev.value;
  const notice = prefill.value && postUpdate.value ? updateText.value.trim() : '';
  const body = {
    ...f,
    ...(startsAt && { startsAt: startsAtIso.value }),
    ...('voteDeadline' in changes.value && { voteDeadline: voteDeadline ? teamTime(...(voteDeadline.split('T') as [string, string])) : null }),
    ...(repeat && { repeat: repeat === 'none' ? null : repeat }),
    ...('repeatUntil' in changes.value && { repeatUntil: repeatUntil || null }),
    ...('billTotal' in changes.value && { billTotal: billTotal ?? null }),
    ...(notice && { notice }),
    ...(rederive.value?.hold.length && reconfirmIso.value && { reconfirmBy: reconfirmIso.value }),
  };
  if (!Object.keys(body).length) return;
  saving.value = true;
  errors.value = {};
  try {
    await $fetch(`/api/events/${e.id}`, { method: 'PATCH', body, headers: props.manageKey ? { 'x-manage-key': props.manageKey } : {} });
  } catch (err) {
    onSaveError(err, 'voteDeadline' in body);
    return;
  } finally {
    saving.value = false;
  }
  snapshot.value = { ...form.value };
  open.value = false;
  emit('changed');
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
          <UFormField :label="t('edit.honorees')" :hint="t('edit.honoreesHint')">
            <USelectMenu v-model="form.honorees" :items="members" value-key="id" label-key="name" multiple :placeholder="t('edit.honoreesPick')" class="w-full" />
          </UFormField>
          <UFormField :label="t('create.where')" :error="errors.venueLink">
            <div class="space-y-2">
              <UInput v-model="form.venue" :maxlength="100" :placeholder="t('create.venue')" :disabled="frozen" class="w-full" />
              <UInput v-model="form.venueLink" type="url" :placeholder="t('create.venueLink')" :disabled="frozen" class="w-full" />
            </div>
          </UFormField>
          <UAlert v-if="endsPlaceVote" color="warning" variant="subtle" icon="i-lucide-map-pin-check" :title="t('edit.endsPlaceVote', { n: data.venues.length })" />
        </section>

        <UFormField v-if="!editingDays" :label="t('manage.schedule')" :error="errors.startsAt">
          <DateTimeInput v-model="form.startsAt" :disabled="frozen" class="w-full" />
        </UFormField>
        <div v-if="frozen" class="space-y-2">
          <p class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-lock" class="size-4" />{{ t('edit.planFrozen') }}</p>
          <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-calendar-cog" @click="correcting = true">{{ t('correct.open') }}</UButton>
        </div>
        <template v-if="rederive && (rederive.going.length || rederive.hold.length || rederive.release.length)">
          <UAlert
            v-if="rederive.going.length || rederive.hold.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-calendar-clock"
            :title="t('edit.rederive', { n: rederive.going.length, m: rederive.hold.length })"
            :description="names(rederive.hold)"
          />
          <UFormField v-if="rederive.hold.length" :label="t('edit.reconfirmBy')">
            <DateTimeInput v-model="reconfirmBy" class="w-full" />
          </UFormField>
          <UAlert v-if="rederive.release.length" color="neutral" variant="subtle" icon="i-lucide-clock" :title="t('edit.released', { n: rederive.release.length }, rederive.release.length)" :description="names(rederive.release)" />
        </template>

        <UFormField v-if="ev.stage === 'poll' && voteOpen" :label="t('edit.deadline')" :hint="t('edit.deadlineHint')" :error="errors.voteDeadline">
          <DateTimeInput v-model="form.voteDeadline" class="w-full" />
        </UFormField>
        <p v-else-if="ev.stage === 'poll'" class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-lock" class="size-4" />{{ t('edit.votingClosed') }}</p>

        <UFormField :label="t('create.capacity')" :error="errors.capacity">
          <UInputNumber v-model="form.capacity" :min="1" :max="500" class="w-40" />
        </UFormField>
        <UFormField :label="t('create.maxGuests')" :hint="t('create.maxGuestsHint')" :error="errors.maxGuests">
          <UInputNumber v-model="form.maxGuests" :min="0" :max="MAX_GUESTS" class="w-40" />
        </UFormField>
        <UFormField v-if="canRepeat" :error="errors.repeat">
          <RepeatFields v-model:repeat="form.repeat" v-model:until="form.repeatUntil" />
        </UFormField>
        <UCheckbox v-model="form.hideVotes" :label="t('create.hideVotes')" :description="t('create.hideVotesHint')" />
        <UAlert
          v-if="seatMoves?.waitlisted.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-hourglass"
          :title="t('edit.capWaitlist', { n: seatMoves.waitlisted.length })"
          :description="names(seatMoves.waitlisted)"
        />
        <UAlert
          v-if="seatMoves?.promoted.length"
          color="info"
          variant="subtle"
          icon="i-lucide-armchair"
          :title="t('edit.capPromote', { n: seatMoves.promoted.length })"
          :description="names(seatMoves.promoted)"
        />

        <section class="space-y-3">
          <UFormField v-if="billCorrectable" :label="t('manage.bill')" :hint="t('edit.billHint')">
            <UInputNumber v-model="form.billTotal" :min="0" :step="1000" :format-options="{ maximumFractionDigits: 0 }" class="w-48" />
          </UFormField>
          <UAlert
            v-if="shareChange"
            color="warning"
            variant="subtle"
            icon="i-lucide-receipt"
            :title="t('edit.shareChange', { from: fmtShare(shareChange.from), to: fmtShare(shareChange.to) })"
            :description="t('edit.shareChangeHint')"
          />
          <UFormField :label="t('create.bank')" :error="errors.bank">
            <div class="grid gap-2 sm:grid-cols-3">
              <UInput v-model="form.bankId" :placeholder="t('create.bankId')" />
              <UInput v-model="form.bankAccount" :placeholder="t('create.bankAccount')" inputmode="numeric" />
              <UInput v-model="form.bankHolder" :placeholder="t('create.bankHolder')" />
            </div>
            <BankQrPreview :bank-id="form.bankId" :bank-account="form.bankAccount" :bank-holder="form.bankHolder" class="mt-2" />
          </UFormField>
        </section>

        <UFormField :label="t('cover.label')" :error="errors.cover">
          <CoverPicker v-model="form.cover" />
        </UFormField>

        <UFormField :label="t('theme.label')" :hint="t('theme.hint')">
          <ThemePicker v-model="form.theme" :title="form.title" :cover="form.cover" />
        </UFormField>

        <section v-if="prefill" class="space-y-2 rounded-lg p-3 ring ring-default">
          <UCheckbox v-model="postUpdate" :label="t('edit.postUpdate')" :description="t('edit.postUpdateHint')" />
          <UTextarea v-if="postUpdate" v-model="updateText" :maxlength="280" :rows="2" class="w-full" :aria-label="t('edit.postUpdate')" />
        </section>
      </form>
      <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-ban" :title="t('edit.cancelledNote')" />
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <p v-if="dirty" role="status" class="mr-auto flex items-center gap-1.5 text-sm text-warning"><UIcon name="i-lucide-circle-dot" class="size-4" />{{ t('edit.unsaved') }}</p>
        <UButton color="neutral" variant="ghost" @click="tryClose">{{ t('cancel') }}</UButton>
        <UButton v-if="!ev.cancelledAt" type="submit" form="edit-event" :loading="saving" :disabled="!dirty || !form.title.trim()">{{ t('edit.save') }}</UButton>
      </div>
    </template>
  </USlideover>

  <EventCorrectDialog v-model:open="correcting" :data="data" :manage-key="manageKey" @changed="emit('changed')" />

  <UModal v-model:open="discarding" :title="t('edit.discardTitle')" :description="t('edit.discardBody')" :close="false" :content="{ onOpenAutoFocus: focusKeep }">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="discard">{{ t('edit.discard') }}</UButton>
        <UButton ref="keepBtn" @click="discarding = false">{{ t('edit.keepEditing') }}</UButton>
      </div>
    </template>
  </UModal>
</template>
