<script setup lang="ts">
const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null; role: Role }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const { members } = useMe();
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
    props.data.share,
    props.data.held.includes(id)
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
  declined: { icon: null, tone: 'bg-elevated text-2xl', jump: null },
  voteClosed: { icon: 'i-lucide-lock', tone: 'bg-warning/15 text-warning', jump: null },
  rsvp: { icon: 'i-lucide-hand', tone: 'bg-secondary/15 text-secondary', jump: 'rsvp' },
  confirm: { icon: 'i-lucide-calendar-clock', tone: 'bg-warning/15 text-warning', jump: 'rsvp' },
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
// The wording variant: a place-only poll, a held or released seat, attendance counted from votes, a Completed event with debts.
const copy = computed(() => {
  const step = next.value.step;
  if (step === 'vote' && !ev.value.pollDays.length) return 'voteVenue';
  if (step === 'confirm' && mine.value?.derived === 'reconfirm') return mine.value.held ? 'reconfirmHeld' : 'reconfirmLost';
  if (step === 'going' && mine.value?.derived === 'going') return 'goingAuto';
  if (step === 'settled' && props.data.share !== null && !allPaid(payers.value, props.data.share)) return 'completedOpen';
  return step;
});
const bodyKey = computed(() => (copy.value === 'voteClosed' && canAdvance.value ? 'bodyHost' : 'body'));
const when = computed(() => (ev.value.startsAt ? fmtDateTime(ev.value.startsAt, locale.value) : ''));
const params = computed(() => ({
  n: props.data.responses.filter((r) => r.days.length || r.venueIds.length).length,
  when: when.value,
  deadline: ev.value.reconfirmBy ? fmtDateTime(ev.value.reconfirmBy, locale.value) : '',
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

// "Can't join" while polling: the server also withdraws the member's votes. null takes it back.
async function decline(status: 'no' | null) {
  await call('/response', 'PUT', { memberId: props.me!.id, status });
  emit('changed');
}

async function patch(body: object) {
  if (!(await call('', 'PATCH', body))) return false;
  emit('changed');
  return true;
}

// Finalize: days and places ranked by votes with the leader preselected, read when the dialog opens (votes keep coming in).
const lockOpen = ref(false);
const voted = computed(() => props.data.responses.filter((r) => r.days.length || r.venueIds.length).length);
const pending = computed(() => pendingVoters(members.value, props.data.responses));
const lock = reactive({ day: '', time: '19:00', venueId: undefined as number | undefined });
const dayRank = computed(() =>
  rankDays(ev.value.pollDays, props.data.responses).map((d) => ({ value: d.day, n: d.n, label: fmtDay(d.day, locale.value), description: t('next.votes', { n: d.n }, d.n) }))
);
const bar = (n: number) => `${voted.value ? Math.round((n / voted.value) * 100) : 0}%`;
const venueRank = computed(() =>
  props.data.venues.map((v) => ({ value: v.id, n: v.upvotes.length, label: v.name, description: t('next.votes', { n: v.upvotes.length }, v.upvotes.length) }))
);
const tied = (rank: { n: number }[]) => rank.length > 1 && rank[0]!.n === rank[1]!.n;
watch(lockOpen, (o) => {
  if (!o) return;
  lock.day = dayRank.value[0]?.value ?? '';
  lock.venueId = venueRank.value[0]?.value;
});
// What locking does to attendance, shown before it happens: the same shared rules the server applies.
const lockRows = computed(() =>
  props.data.responses.map((r) => ({ ...r, goingAt: r.goingAt ? new Date(r.goingAt) : null, firstVotedAt: r.firstVotedAt ? new Date(r.firstVotedAt) : null }))
);
const lockSeen = computed(() => {
  const venue = props.data.venues.find((v) => v.id === lock.venueId);
  const startsAt = ev.value.pollDays.length ? teamTime(lock.day, lock.time) : ev.value.startsAt;
  return lockImpact(lockRows.value, planFor(ev.value.pollDays, startsAt, props.data.venues, ev.value.venue ?? venue?.name ?? null), ev.value.capacity, new Date(), ev.value, 'lock');
});
const nameList = (rs: { name: string }[]) => rs.map((r) => r.name).join(', ');
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

// Close voting stops participants now; reopening names a new deadline (or none). Votes are never touched.
const closeOpen = ref(false);
async function closeVoting() {
  if (await patch({ closeVoting: true })) closeOpen.value = false;
}
const reopenOpen = ref(false);
const reopen = reactive({ mode: 'none' as 'none' | 'date', when: '' });
watch(reopenOpen, (o) => {
  if (!o) return;
  const d = ev.value.voteDeadline;
  const keep = !!d && new Date(d).getTime() > Date.now();
  Object.assign(reopen, { mode: keep ? 'date' : 'none', when: keep ? toTeamInput(d as string) : '' });
});
const reopenDeadline = computed(() => (reopen.mode === 'date' && reopen.when ? teamTime(...(reopen.when.split('T') as [string, string])) : null));
const reopenInvalid = computed(() => reopen.mode === 'date' && (!reopenDeadline.value || new Date(reopenDeadline.value).getTime() <= Date.now()));
async function reopenVoting() {
  if (await patch({ reopenVoting: true, voteDeadline: reopenDeadline.value })) reopenOpen.value = false;
}
// Reka would focus the first control; the safe choice (Cancel) must get the focus instead.
const cancelBtn = useTemplateRef<{ $el: HTMLElement }>('cancelBtn');
function focusCancel(e: Event) {
  e.preventDefault();
  cancelBtn.value?.$el.focus();
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

// Complete without a bill, or with debts still open: both ask first, then it's the same one move.
const completeOpen = ref<'free' | 'anyway' | null>(null);
const owing = computed(() =>
  payers.value
    .map((r) => ({ name: r.name, left: paymentOf(r, (props.data.share ?? 0) * (1 + r.guests)).left }))
    .filter((r) => r.left > 0)
);
async function complete() {
  if (await patch({ stage: 'settled' })) {
    completeOpen.value = null;
    confetti();
  }
}
</script>

<template>
  <UCard v-if="!me && !ev.cancelledAt" id="who" :ui="{ root: 'ring-2 ring-primary/40', body: 'space-y-3' }">
    <div class="flex items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary"><UIcon name="i-lucide-hand-heart" class="size-5" /></span>
      <div>
        <p class="font-semibold text-highlighted">{{ t('next.who.title') }}</p>
        <p class="text-sm text-muted">{{ t('next.who.body') }}</p>
      </div>
    </div>
    <MemberPicker />
  </UCard>

  <UCard v-if="next.step !== 'cancelled' && (me || canAdvance)" :ui="{ body: 'flex flex-wrap items-center gap-4' }">
    <div class="flex min-w-64 flex-1 items-start gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-lg" :class="ui.tone"><UIcon v-if="ui.icon" :name="ui.icon" class="size-5" /><span v-else aria-hidden="true">😭</span></span>
      <div class="min-w-0">
        <UBadge
          v-if="ev.stage === 'poll' && !ev.cancelledAt"
          :color="votingClosed ? 'warning' : 'success'"
          variant="subtle"
          size="sm"
          :icon="votingClosed ? 'i-lucide-lock' : 'i-lucide-vote'"
          :label="t(votingClosed ? 'overview.closed' : 'overview.open')"
          class="mb-1"
        />
        <p class="font-semibold text-highlighted">{{ t(`next.${copy}.title`, params) }}</p>
        <p class="text-sm text-muted">{{ t(`next.${copy}.${bodyKey}`, params) }}</p>
        <p v-if="closes" class="mt-0.5 flex items-center gap-1 text-xs text-muted"><UIcon name="i-lucide-clock" class="size-3.5" />{{ closes }}</p>
        <UAvatarGroup v-if="next.step === 'settled' && payers.length" :max="8" size="xs" class="mt-2">
          <UAvatar v-for="p in payers" :key="p.memberId" :alt="p.name" :title="p.name" />
        </UAvatarGroup>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      <UButton v-if="ui.jump" :variant="next.action ? 'outline' : 'solid'" :color="next.action ? 'neutral' : 'primary'" trailing-icon="i-lucide-arrow-down" @click="jump(ui.jump)">
        {{ t(`next.${copy}.cta`) }}
      </UButton>
      <UButton v-if="me && (next.step === 'vote' || next.step === 'voted')" color="neutral" variant="ghost" icon="i-lucide-circle-x" :loading="busy" @click="decline('no')">
        {{ t('next.declined.cannot') }}
      </UButton>
      <UButton v-if="next.step === 'declined'" color="primary" icon="i-lucide-undo-2" :loading="busy" @click="decline(null)">{{ t('next.declined.cta') }}</UButton>
      <UButton v-if="next.action === 'lock'" color="neutral" variant="outline" :icon="votingClosed ? 'i-lucide-lock-open' : 'i-lucide-lock'" @click="votingClosed ? (reopenOpen = true) : (closeOpen = true)">
        {{ t(votingClosed ? 'next.action.reopen' : 'next.action.close') }}
      </UButton>
      <UButton v-if="next.action === 'lock'" icon="i-lucide-calendar-check" @click="lockOpen = true">
        {{ t(next.step === 'voteClosed' ? 'next.action.pick' : 'next.action.lock') }}
      </UButton>
      <UButton v-if="next.action === 'bill'" icon="i-lucide-receipt" @click="billOpen = true">{{ t('next.action.bill') }}</UButton>
      <UButton v-if="next.action === 'bill' && ev.billTotal === null" color="neutral" variant="outline" icon="i-lucide-check" @click="completeOpen = 'free'">{{ t('next.action.completeFree') }}</UButton>
      <UButton v-if="next.action === 'settle'" icon="i-lucide-sparkles" color="secondary" :loading="busy" @click="settle">{{ t('next.action.settle') }}</UButton>
      <UButton v-if="ev.stage === 'bill' && canAdvance && next.action !== 'settle'" color="neutral" variant="outline" icon="i-lucide-check" @click="completeOpen = 'anyway'">
        {{ t('next.action.completeAnyway') }}
      </UButton>
    </div>
  </UCard>

  <UModal v-model:open="lockOpen" :title="t('manage.lock')">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1 rounded-lg bg-elevated/50 p-3 text-sm">
          <p class="font-medium tabular-nums">{{ t('overview.voted', { n: voted, total: Math.max(members.length, voted) }) }}</p>
          <p v-if="pending.length" class="text-muted">
            {{ t('overview.notVoted', { names: pending.slice(0, 5).map((m) => m.name).join(', ') }) }}<template v-if="pending.length > 5">{{ ' ' + t('overview.more', { n: pending.length - 5 }) }}</template>
          </p>
        </div>
        <UFormField v-if="dayRank.length" :label="t('next.lockDay')">
          <div class="space-y-3">
            <URadioGroup v-model="lock.day" :items="dayRank" class="max-h-56 overflow-y-auto">
              <template #description="{ item }">
                <span class="tabular-nums">{{ item.description }}</span>
                <span class="mt-1 block h-1 w-40 max-w-full overflow-hidden rounded-full bg-elevated" aria-hidden="true">
                  <span class="block h-full rounded-full bg-primary" :style="{ width: bar((item as { n: number }).n) }" />
                </span>
              </template>
            </URadioGroup>
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
        <div class="space-y-1 text-sm text-muted">
          <p class="font-medium text-default">{{ t('next.lockHint') }}</p>
          <ul class="list-disc space-y-0.5 pl-5">
            <li>{{ t('next.consequences.end') }}</li>
            <li v-if="lockSeen.going.length">{{ t('next.lockGoing', { names: nameList(lockSeen.going) }) }}</li>
            <li v-if="lockSeen.waiting.length">{{ t('next.lockWaiting', { n: lockSeen.waiting.length }, lockSeen.waiting.length) }}</li>
            <li v-if="lockSeen.confirm.length">{{ t('next.lockConfirm', { n: lockSeen.confirm.length }, lockSeen.confirm.length) }}</li>
            <li>{{ t('next.consequences.rsvp') }}</li>
            <li>{{ t('next.consequences.kept') }}</li>
          </ul>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="lockOpen = false">{{ t('cancel') }}</UButton>
        <UButton icon="i-lucide-lock" :loading="busy" :disabled="!!ev.pollDays.length && !lock.day" @click="lockEvent">{{ t('manage.lockButton') }}</UButton>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="closeOpen" :title="t('next.closeTitle')" :description="t('next.closeBody')" :content="{ onOpenAutoFocus: focusCancel }">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="closeOpen = false">{{ t('cancel') }}</UButton>
        <UButton color="warning" icon="i-lucide-lock" :loading="busy" @click="closeVoting">{{ t('next.action.close') }}</UButton>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="reopenOpen" :title="t('next.reopenTitle')" :description="t('next.reopenBody')">
    <template #body>
      <div class="space-y-3">
        <URadioGroup v-model="reopen.mode" :items="[{ value: 'none', label: t('next.reopenNone') }, { value: 'date', label: t('next.reopenDate') }]" />
        <UInput v-if="reopen.mode === 'date'" v-model="reopen.when" type="datetime-local" class="w-full" :aria-label="t('next.reopenDate')" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="reopenOpen = false">{{ t('cancel') }}</UButton>
        <UButton icon="i-lucide-lock-open" :loading="busy" :disabled="reopenInvalid" @click="reopenVoting">{{ t('next.action.reopen') }}</UButton>
      </div>
    </template>
  </UModal>

  <UModal
    :open="completeOpen !== null"
    :title="t(completeOpen === 'free' ? 'next.completeFreeTitle' : 'next.completeAnywayTitle')"
    :description="t(completeOpen === 'free' ? 'next.completeFreeBody' : 'next.completeAnywayBody')"
    :content="{ onOpenAutoFocus: focusCancel }"
    @update:open="completeOpen = null"
  >
    <template v-if="completeOpen === 'anyway'" #body>
      <ul class="space-y-1 text-sm">
        <li v-for="o in owing" :key="o.name" class="flex justify-between gap-3">
          <span>{{ o.name }}</span>
          <span class="tabular-nums text-muted">{{ fmtVnd(o.left) }}</span>
        </li>
      </ul>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="completeOpen = null">{{ t('cancel') }}</UButton>
        <UButton icon="i-lucide-check" :loading="busy" @click="complete">{{ t(completeOpen === 'free' ? 'next.action.completeFree' : 'next.action.completeAnyway') }}</UButton>
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
