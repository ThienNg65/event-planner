<script setup lang="ts">
const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null; role: Role }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const ev = computed(() => props.data.event);
const payers = computed(() => props.data.confirmed.map((id) => props.data.responses.find((r) => r.memberId === id)!));
const mine = computed(() => {
  const id = props.me?.id;
  if (id === undefined) return null;
  return mineOf(
    props.data.responses.find((r) => r.memberId === id),
    props.data.confirmed.includes(id),
    props.data.waitlist.includes(id),
    props.data.share
  );
});
const canAdvance = computed(() => can(props.role, 'advance'));
const votingClosed = computed(() => ev.value.stage === 'poll' && !votingOpen(ev.value));
const next = computed(() =>
  nextStep({
    stage: ev.value.stage,
    mine: mine.value,
    manager: canAdvance.value,
    allPaid: allPaid(payers.value, props.data.share),
    started: !!ev.value.startsAt && new Date(ev.value.startsAt).getTime() < Date.now(),
    cancelled: !!ev.value.cancelledAt,
    votingClosed: votingClosed.value,
  })
);

const STEP_UI = {
  vote: { icon: 'i-lucide-vote', tone: 'bg-secondary/15 text-secondary', jump: 'poll' },
  voted: { icon: 'i-lucide-circle-check', tone: 'bg-success/15 text-success', jump: 'poll' },
  voteClosed: { icon: 'i-lucide-lock', tone: 'bg-warning/15 text-warning', jump: null },
  rsvp: { icon: 'i-lucide-hand', tone: 'bg-secondary/15 text-secondary', jump: 'rsvp' },
  going: { icon: 'i-lucide-party-popper', tone: 'bg-success/15 text-success', jump: null },
  waitlist: { icon: 'i-lucide-hourglass', tone: 'bg-warning/15 text-warning', jump: null },
  replied: { icon: 'i-lucide-circle-check', tone: 'bg-elevated text-muted', jump: 'rsvp' },
  pay: { icon: 'i-lucide-wallet', tone: 'bg-secondary/15 text-secondary', jump: 'bill' },
  paid: { icon: 'i-lucide-badge-check', tone: 'bg-success/15 text-success', jump: null },
  done: { icon: 'i-lucide-coffee', tone: 'bg-elevated text-muted', jump: null },
  settled: { icon: 'i-lucide-sparkles', tone: 'bg-secondary/15 text-secondary', jump: null },
  cancelled: { icon: 'i-lucide-ban', tone: 'bg-elevated text-muted', jump: null },
} as const;
const ui = computed(() => STEP_UI[next.value.step]);
// A poll with no candidate days is a place-only vote, so it gets its own wording.
const copy = computed(() => (next.value.step === 'vote' && !ev.value.pollDays.length ? 'voteVenue' : next.value.step));
const bodyKey = computed(() => (copy.value === 'voteClosed' && canAdvance.value ? 'bodyHost' : 'body'));
const when = computed(() => (ev.value.startsAt ? fmtDateTime(ev.value.startsAt, locale.value) : ''));
const params = computed(() => ({
  n: props.data.responses.filter((r) => r.days.length || r.venueIds.length).length,
  when: when.value,
  place: props.data.waitlist.indexOf(props.me?.id ?? -1) + 1,
  amount: fmtVnd(mine.value?.left ?? 0),
  reason: ev.value.cancelReason ?? '',
}));
const closes = computed(() =>
  ev.value.voteDeadline && next.value.step !== 'voteClosed' && ev.value.stage === 'poll' && !ev.value.cancelledAt
    ? t('next.closes', { when: fmtDateTime(ev.value.voteDeadline, locale.value) })
    : ''
);

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function patch(body: object) {
  if (!(await call('', 'PATCH', body))) return false;
  emit('changed');
  return true;
}

// Finalize: days and places ranked by votes with the leader preselected, read when the dialog opens (votes keep coming in).
const lockOpen = ref(false);
const dayVotes = (d: string) => props.data.responses.filter((r) => r.days.includes(d)).length;
const lock = reactive({ day: '', time: '19:00', venueId: undefined as number | undefined });
const dayRank = computed(() =>
  ev.value.pollDays
    .map((d) => ({ value: d, n: dayVotes(d) }))
    .sort((a, b) => b.n - a.n)
    .map((d) => ({ value: d.value, n: d.n, label: fmtDay(d.value, locale.value), description: t('next.votes', { n: d.n }, d.n) }))
);
const venueRank = computed(() =>
  props.data.venues.map((v) => ({ value: v.id, n: v.upvotes.length, label: v.name, description: t('next.votes', { n: v.upvotes.length }, v.upvotes.length) }))
);
const tied = (rank: { n: number }[]) => rank.length > 1 && rank[0]!.n === rank[1]!.n;
watch(lockOpen, (o) => {
  if (!o) return;
  lock.day = dayRank.value[0]?.value ?? '';
  lock.venueId = venueRank.value[0]?.value;
});
async function lockEvent() {
  const venue = props.data.venues.find((v) => v.id === lock.venueId);
  const ok = await patch({
    stage: 'rsvp',
    ...(ev.value.pollDays.length && { startsAt: teamTime(lock.day, lock.time) }),
    ...(!ev.value.venue && venue && { venue: venue.name, venueLink: venue.link || null }),
  });
  if (ok) {
    lockOpen.value = false;
    confetti();
  }
}

const billOpen = ref(false);
const bill = reactive({ total: null as number | null, bankId: '', bankAccount: '', bankHolder: '' });
watch(billOpen, (o) => {
  if (!o) return;
  Object.assign(bill, {
    total: ev.value.billTotal,
    bankId: ev.value.bankId ?? '',
    bankAccount: ev.value.bankAccount ?? '',
    bankHolder: ev.value.bankHolder ?? '',
  });
});
async function saveBill() {
  const { total, ...bank } = bill;
  if (await patch({ billTotal: total, stage: 'bill', ...bank })) billOpen.value = false;
}

async function settle() {
  if (await patch({ stage: 'settled' })) confetti();
}
</script>

<template>
  <UCard v-if="!me && !ev.cancelledAt" id="who" :ui="{ root: 'ring-2 ring-primary/40', body: 'space-y-3' }">
    <div class="flex items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><UIcon name="i-lucide-hand-heart" class="size-5" /></span>
      <div>
        <p class="font-semibold text-highlighted">{{ t('next.who.title') }}</p>
        <p class="text-sm text-muted">{{ t('next.who.body') }}</p>
      </div>
    </div>
    <MemberPicker />
  </UCard>

  <UCard v-else-if="next.step !== 'cancelled'" :ui="{ body: 'flex flex-col gap-4 sm:flex-row sm:items-center' }">
    <div class="flex min-w-0 flex-1 items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-full" :class="ui.tone"><UIcon :name="ui.icon" class="size-5" /></span>
      <div class="min-w-0">
        <p class="font-semibold text-highlighted">{{ t(`next.${copy}.title`, params) }}</p>
        <p class="text-sm text-muted">{{ t(`next.${copy}.${bodyKey}`, params) }}</p>
        <p v-if="closes" class="mt-0.5 flex items-center gap-1 text-xs text-muted"><UIcon name="i-lucide-clock" class="size-3.5" />{{ closes }}</p>
        <UAvatarGroup v-if="next.step === 'settled' && payers.length" :max="8" size="xs" class="mt-2">
          <UAvatar v-for="p in payers" :key="p.memberId" :alt="p.name" :title="p.name" />
        </UAvatarGroup>
      </div>
    </div>
    <div class="flex shrink-0 flex-wrap gap-2">
      <UButton v-if="ui.jump" :variant="next.action ? 'outline' : 'solid'" :color="next.action ? 'neutral' : 'primary'" trailing-icon="i-lucide-arrow-down" @click="jump(ui.jump)">
        {{ t(`next.${copy}.cta`) }}
      </UButton>
      <UButton v-if="next.action === 'lock'" icon="i-lucide-lock" @click="lockOpen = true">
        {{ t(next.step === 'voteClosed' ? 'next.action.pick' : 'next.action.lock') }}
      </UButton>
      <UButton v-if="next.action === 'bill'" icon="i-lucide-receipt" @click="billOpen = true">{{ t('next.action.bill') }}</UButton>
      <UButton v-if="next.action === 'settle'" icon="i-lucide-sparkles" color="secondary" :loading="busy" @click="settle">{{ t('next.action.settle') }}</UButton>
    </div>
  </UCard>

  <UModal v-model:open="lockOpen" :title="t('manage.lock')">
    <template #body>
      <div class="space-y-4">
        <UFormField v-if="dayRank.length" :label="t('next.lockDay')">
          <div class="space-y-3">
            <URadioGroup v-model="lock.day" :items="dayRank" class="max-h-56 overflow-y-auto" />
            <p v-if="tied(dayRank)" class="text-sm text-warning">{{ t('next.tie') }}</p>
            <UInput v-model="lock.time" type="time" class="w-32" />
          </div>
        </UFormField>
        <UFormField v-if="!ev.venue && venueRank.length" :label="t('create.where')">
          <div class="space-y-3">
            <URadioGroup v-model="lock.venueId" :items="venueRank" class="max-h-56 overflow-y-auto" />
            <p v-if="tied(venueRank)" class="text-sm text-warning">{{ t('next.tie') }}</p>
          </div>
        </UFormField>
        <p class="text-sm text-muted">{{ t('next.lockHint') }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="lockOpen = false">{{ t('cancel') }}</UButton>
        <UButton icon="i-lucide-lock" :loading="busy" :disabled="!!ev.pollDays.length && !lock.day" @click="lockEvent">{{ t('manage.lockButton') }}</UButton>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="billOpen" :title="t('next.action.bill')">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('manage.bill')" :hint="t('next.billHint', { n: data.seats })">
          <UInputNumber v-model="bill.total" :min="0" :step="1000" :format-options="{ maximumFractionDigits: 0 }" class="w-48" />
        </UFormField>
        <UFormField :label="t('create.bank')" :hint="t('create.bankHint')">
          <div class="grid gap-2 sm:grid-cols-3">
            <UInput v-model="bill.bankId" :placeholder="t('create.bankId')" />
            <UInput v-model="bill.bankAccount" :placeholder="t('create.bankAccount')" inputmode="numeric" />
            <UInput v-model="bill.bankHolder" :placeholder="t('create.bankHolder')" />
          </div>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="billOpen = false">{{ t('cancel') }}</UButton>
        <UButton icon="i-lucide-receipt" :loading="busy" :disabled="bill.total === null" @click="saveBill">{{ t('next.billSave') }}</UButton>
      </div>
    </template>
  </UModal>
</template>
