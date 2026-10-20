<script setup lang="ts">
import { HOST_MORE, type HostMoreItem } from '~/composables/useHostMore';

const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null; role: Role }>();
const emit = defineEmits<{ changed: [] }>();
const { t, te, locale } = useI18n();
const join = useJoin();
const origin = useRequestURL().origin;
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
const whoOpen = ref(false);
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
  // Voted only for a place: the title must not say the days are done.
  const row = props.data.responses.find((r) => r.memberId === props.me?.id);
  if (step === 'voted' && ev.value.pollDays.length && !row?.days.length && !row?.maybeDays?.length) return 'votedNoDay';
  if (step === 'confirm' && mine.value?.derived === 'reconfirm') return mine.value.held ? 'reconfirmHeld' : 'reconfirmLost';
  if (step === 'going' && mine.value?.derived === 'going') return 'goingAuto';
  if (step === 'settled' && props.data.share !== null && !allPaid(payers.value, props.data.share)) return 'completedOpen';
  return step;
});
const bodyKey = computed(() => (copy.value === 'voteClosed' && canAdvance.value ? 'bodyHost' : 'body'));
const when = computed(() => (ev.value.startsAt ? fmtDateTime(ev.value.startsAt, locale.value) : ''));
const params = computed(() => ({
  n: props.data.responses.filter(hasPicked).length,
  when: when.value,
  deadline: ev.value.reconfirmBy ? fmtDateTime(ev.value.reconfirmBy, locale.value) : '',
  place: props.data.waitlist.indexOf(props.me?.id ?? -1) + 1,
  amount: fmtVnd(mine.value?.left ?? 0),
  reason: ev.value.cancelReason ?? '',
  host: props.data.hostName || t('next.organizers'),
}));
// One solid button per card: the visitor's own to-do comes first, otherwise the organizer's next move.
const myTodo = computed(() => TODO_STEPS.includes(next.value.step) || next.value.step === 'declined');
const hostMain = computed(() => (myTodo.value && !allAnswered.value ? { color: 'neutral' as const, variant: 'outline' as const } : { color: 'primary' as const, variant: 'solid' as const }));
// Everyone on the team has answered: nudge the organizer to lock now.
const allAnswered = computed(() => ev.value.stage === 'poll' && voted.value > 0 && pending.value.length === 0);
// The lock also settles the place when places are polled, so its button says so.
const lockKey = computed(() => {
  const places = !ev.value.venue && props.data.venues.length > 0;
  if (!ev.value.pollDays.length) return 'next.action.lockPlace';
  return places ? 'next.action.lockBoth' : 'next.action.lock';
});
const hostActions = computed(() => canAdvance.value && (!!next.value.action || ev.value.stage === 'bill' || ev.value.stage === 'rsvp'));

// Secondary organizer moves: close or reopen voting, an early look at the bill, completing without a bill or with debts open.
const hostMore = computed(() => {
  const items: HostMoreItem[] = [];
  if (next.value.action === 'lock') {
    items.push({ label: t(votingClosed.value ? 'next.action.reopen' : 'next.action.close'), icon: votingClosed.value ? 'i-lucide-lock-open' : 'i-lucide-lock', onSelect: () => (votingClosed.value ? (reopenOpen.value = true) : (closeOpen.value = true)) });
  }
  if (ev.value.stage === 'rsvp' && next.value.action !== 'bill') items.push({ label: t('next.action.preview'), icon: 'i-lucide-eye', onSelect: () => (previewOpen.value = true) });
  if (next.value.action === 'bill' && ev.value.billTotal === null) items.push({ label: t('next.action.completeFree'), icon: 'i-lucide-check', onSelect: () => (completeOpen.value = 'free') });
  if (ev.value.stage === 'bill' && next.value.action !== 'settle') items.push({ label: t('next.action.completeAnyway'), icon: 'i-lucide-check', onSelect: () => (completeOpen.value = 'anyway') });
  return items;
});
// They live in the Manage menu (EventHostMenu), so organizers have one menu; the dialogs stay here.
const sharedMore = inject(HOST_MORE, null);
watchEffect(() => {
  if (sharedMore) sharedMore.value = hostMore.value;
});

// The phone action bar repeats the card's one main button once the card has scrolled away, and hides while typing
// (an on-screen keyboard would push it over the field). The organizer's move wins over the visitor's own to-do.
type BarAction = { label: string; icon: string; run: () => void; loading?: boolean };
const barAction = computed<BarAction | null>(() => {
  if (next.value.step === 'cancelled') return null;
  if (next.value.action === 'lock') return { label: t(lockKey.value), icon: 'i-lucide-calendar-check', run: () => (lockOpen.value = true) };
  if (next.value.action === 'bill') return { label: t('next.action.bill'), icon: 'i-lucide-receipt', run: () => (billOpen.value = true) };
  if (next.value.action === 'settle') return { label: t('next.action.settle'), icon: 'i-lucide-sparkles', run: settle, loading: busy.value };
  // A signed-out visitor first says who they are (the card's "Your name?" link).
  if (!props.me) return votingClosed.value ? null : { label: t('next.who.title'), icon: 'i-lucide-user-round', run: () => join.ask() };
  if (next.value.step === 'declined') return { label: t('next.declined.cta'), icon: 'i-lucide-undo-2', run: () => decline(null), loading: busy.value };
  const target = ui.value.jump;
  if (myTodo.value && target) return { label: t(`next.${copy.value}.cta`), icon: 'i-lucide-arrow-down', run: () => jump(target) };
  return null;
});
const cardEl = useTemplateRef<HTMLElement>('cardEl');
const cardVisible = ref(true);
const typing = ref(false);
const isField = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
let seen: IntersectionObserver | null = null;
const onFocusIn = (e: FocusEvent) => (typing.value = isField(e.target));
const onFocusOut = () => (typing.value = false);
onMounted(() => {
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  seen = new IntersectionObserver(([entry]) => (cardVisible.value = !!entry?.isIntersecting));
  watch(cardEl, (el, old) => {
    if (old) seen?.unobserve(old);
    if (el) seen?.observe(el);
    else cardVisible.value = false;
  }, { immediate: true });
});
onBeforeUnmount(() => {
  document.removeEventListener('focusin', onFocusIn);
  document.removeEventListener('focusout', onFocusOut);
  seen?.disconnect();
});
const showBar = computed(() => !!barAction.value && !cardVisible.value && !typing.value);

// Add to calendar sits with the answer it follows: once you are in (or asked to confirm) and the date is set.
const calendar = computed(() => {
  const e = ev.value;
  if (!e.startsAt || e.cancelledAt || (next.value.step !== 'going' && next.value.step !== 'confirm')) return null;
  const google = googleCalendarUrl({ ...e, startsAt: e.startsAt }, origin);
  return [
    { label: t('event.calendarFile'), icon: 'i-lucide-download', onSelect: () => window.location.assign(`/api/events/${e.id}/ics?j=${e.joinKey}`) },
    { label: t('event.googleCalendar'), icon: 'i-lucide-external-link', onSelect: () => window.open(google, '_blank', 'noopener') },
  ];
});

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
const voted = computed(() => props.data.responses.filter(hasPicked).length);
const pending = computed(() => pendingVoters(props.data.participants, props.data.responses));
const lock = reactive({ day: '', time: '19:00', venueId: undefined as number | undefined });
// Same order as the organizer's comparison: votes, then honorees who can come, then earliest, so the preselected day is the tie-broken one.
const dayCompare = computed(() => compareDays(ev.value.pollDays, props.data.responses, ev.value.honorees));
const dayRank = computed(() =>
  dayCompare.value.ranked.map((d) => ({ value: d.day, n: d.n, label: fmtDay(d.day, locale.value), description: t('next.votes', { n: d.n }, d.n) }))
);
// Participants see the day that is ahead once voting closes (the lock dialog preselects the same one).
const leader = computed(() => (dayRank.value[0]?.n ? dayRank.value[0] : null));
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
// "Who actually came?": guests per ticked member, null = unticked. Pre-ticked with today's confirmed seats.
const checkIn = ref<Record<number, number | null>>({});
// Fixed amount a ticked member sponsors (empty = none): they pay it instead of a share.
const sponsor = ref<Record<number, number | null>>({});
const isPaid = (r: { paidAt: unknown; paidAmount: number | null }) => !!r.paidAt || (r.paidAmount ?? 0) > 0;
const checkRank = (r: { memberId: number; status: string | null }) => {
  if (props.data.confirmed.includes(r.memberId)) return 0;
  if (props.data.waitlist.includes(r.memberId)) return 1;
  return ['maybe', null, 'no'].indexOf(r.status) + 2;
};
const checkRows = computed(() => [...props.data.responses].sort((a, b) => checkRank(a) - checkRank(b) || a.name.localeCompare(b.name)));
const checkLabel = (r: { memberId: number; status: string | null }) => {
  const place = props.data.waitlist.indexOf(r.memberId) + 1;
  if (props.data.confirmed.includes(r.memberId)) return t('people.going');
  if (place) return t('people.waitlist', { n: place });
  return r.status ? t(`people.${r.status}`) : t('next.checkNone');
};
const attended = computed(() =>
  Object.entries(checkIn.value)
    .filter(([, g]) => g !== null)
    .map(([id, g]) => ({ memberId: Number(id), guests: g ?? 0, sponsor: sponsor.value[Number(id)] || null }))
);
const checkShare = computed(() => splitOf(bill.total, attended.value.map((a) => ({ guests: a.guests, sponsorAmount: a.sponsor }))));
const checkSeen = computed(() => attendanceCheck(props.data.responses, props.data.confirmed, attended.value, ev.value.capacity));
// Seats beyond the limit the event was planned with: shown, not refused (walk-ins came anyway).
const plannedCap = computed(() => ev.value.plannedCapacity ?? ev.value.capacity);
const checkOver = computed(() => (plannedCap.value === null ? 0 : Math.max(0, checkSeen.value.seats - plannedCap.value)));
watch(billOpen, (o) => {
  if (!o) return;
  Object.assign(bill, {
    total: ev.value.billTotal,
    bankId: ev.value.bankId ?? '',
    bankAccount: ev.value.bankAccount ?? '',
    bankHolder: ev.value.bankHolder ?? '',
  });
  checkIn.value = Object.fromEntries(props.data.responses.map((r) => [r.memberId, props.data.confirmed.includes(r.memberId) ? r.guests : null]));
  sponsor.value = Object.fromEntries(props.data.responses.map((r) => [r.memberId, r.sponsorAmount]));
});
async function saveBill() {
  const { total, ...bank } = bill;
  if (await patch({ billTotal: total, stage: 'bill', ...bank, attended: attended.value })) billOpen.value = false;
}

// An early look at the payment step: a throwaway total over today's confirmed seats. Nothing is saved and the stage stays rsvp.
const previewOpen = ref(false);
const previewTotal = ref<number | null>(null);
const previewShare = computed(() => shareOf(previewTotal.value, props.data.seats));

async function settle() {
  if (await patch({ stage: 'settled' })) confetti();
}

// Complete without a bill, or with debts still open: both ask first, then it's the same one move.
const completeOpen = ref<'free' | 'anyway' | null>(null);
const owing = computed(() =>
  payers.value
    .map((r) => ({ name: r.name, left: paymentOf(r, owesOf(r, props.data.share ?? 0)).left }))
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
  <!-- After voting closes there is nothing to answer, so this link gives way to a small one below. -->
  <UButton v-if="!me && !ev.cancelledAt && !votingClosed" id="who" variant="link" icon="i-lucide-user-round" class="px-0" @click="join.ask()">{{ t('next.who.title') }}</UButton>

  <div v-if="next.step !== 'cancelled' && (me || canAdvance || votingClosed)" ref="cardEl">
  <div class="space-y-4">
    <!-- Your own answer -->
    <div class="flex flex-wrap items-center gap-4">
      <div class="flex min-w-56 flex-1 items-start gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg" :class="ui.tone"><UIcon v-if="ui.icon" :name="ui.icon" class="size-5" /><span v-else aria-hidden="true">😭</span></span>
        <div class="min-w-0">
          <p class="text-lg leading-snug font-bold text-highlighted">{{ t(`next.${copy}.title`, params) }}</p>
          <p v-if="te(`next.${copy}.${bodyKey}`)" class="text-sm text-muted">{{ t(`next.${copy}.${bodyKey}`, params) }}</p>
          <p v-if="copy === 'voteClosed' && !canAdvance && leader" class="mt-1 text-sm font-medium text-highlighted">{{ t('next.leading', { day: leader.label, n: leader.n }) }}</p>
          <template v-if="!me && votingClosed">
            <button v-if="!whoOpen" type="button" class="mt-1 text-sm text-primary underline underline-offset-2" @click="whoOpen = true">{{ t('next.who.link') }}</button>
            <MemberPicker v-else pick-only class="mt-2" />
          </template>
          <p v-if="next.step === 'settled' && payers.length" class="mt-2 text-xs text-muted">{{ t('next.settled.who') }}</p>
          <UAvatarGroup v-if="next.step === 'settled' && payers.length" :max="8" size="xs" class="mt-1">
            <MemberAvatar v-for="p in payers" :id="p.memberId" :key="p.memberId" :name="p.name" :title="p.name" size="xs" />
          </UAvatarGroup>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton v-if="ui.jump" :variant="myTodo ? 'solid' : 'outline'" :color="myTodo ? 'primary' : 'neutral'" trailing-icon="i-lucide-arrow-down" @click="jump(ui.jump)">
          {{ t(`next.${copy}.cta`) }}
        </UButton>
        <UButton v-if="me && (next.step === 'vote' || next.step === 'voted')" color="neutral" variant="ghost" icon="i-lucide-circle-x" :loading="busy" @click="decline('no')">
          {{ t('next.declined.cannot') }}
        </UButton>
        <UDropdownMenu v-if="calendar" :items="calendar" :content="{ align: 'end' }">
          <UButton color="neutral" variant="ghost" icon="i-lucide-calendar-plus" trailing-icon="i-lucide-chevron-down">{{ t('event.addToCalendar') }}</UButton>
        </UDropdownMenu>
        <UButton v-if="next.step === 'declined'" color="primary" icon="i-lucide-undo-2" :loading="busy" @click="decline(null)">{{ t('next.declined.cta') }}</UButton>
      </div>
    </div>

    <!-- Organizer moves, kept apart from the visitor's own answer: one main button, the rest behind the menu -->
    <div v-if="hostActions" class="flex flex-wrap items-center gap-2 border-t border-dashed border-accented pt-4">
      <p class="mr-auto flex items-center gap-1.5 text-xs font-medium text-muted"><UIcon name="i-lucide-shield-check" class="size-4" />{{ t('next.hostTitle') }}</p>
      <p v-if="next.action === 'lock' && allAnswered" class="basis-full text-sm font-medium text-success">{{ t('next.allAnswered') }}</p>
      <p v-if="ev.stage === 'rsvp' && next.action !== 'bill' && ev.startsAt" class="basis-full text-xs text-muted">{{ t('next.billAfter', { when: fmtDateTime(ev.startsAt, locale) }) }}</p>
      <UButton v-if="next.action === 'lock'" v-bind="hostMain" icon="i-lucide-calendar-check" @click="lockOpen = true">{{ t(lockKey) }}</UButton>
      <UButton v-if="next.action === 'bill'" v-bind="hostMain" icon="i-lucide-receipt" @click="billOpen = true">{{ t('next.action.bill') }}</UButton>
      <UButton v-if="next.action === 'settle'" v-bind="hostMain" icon="i-lucide-sparkles" :loading="busy" @click="settle">{{ t('next.action.settle') }}</UButton>
    </div>
  </div>
  </div>

  <ClientOnly>
    <Teleport to="body">
      <Transition enter-from-class="translate-y-full" leave-to-class="translate-y-full" enter-active-class="transition-transform duration-200" leave-active-class="transition-transform duration-150">
        <div v-if="showBar && barAction" class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <UButton block size="lg" :icon="barAction.icon" :loading="barAction.loading" class="mx-auto max-w-3xl" @click="barAction.run()">{{ barAction.label }}</UButton>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>

  <UModal v-model:open="lockOpen" :title="t('manage.lock')">
    <template #body>
      <div class="space-y-4">
        <div class="space-y-1 rounded-lg bg-elevated/50 p-3 text-sm">
          <p class="font-medium tabular-nums">{{ t('overview.voted', { n: voted, total: Math.max(data.participants.length, voted) }) }}</p>
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
            <!-- Same reason as the organizer's comparison panel, so the preselected day is explained. -->
            <p v-if="dayCompare.tie" class="text-sm text-warning">
              {{ t(dayCompare.tie === 'honorees' ? 'compare.tieHonorees' : 'compare.tieEarlier', { day: dayRank[0]!.label, n: dayRank[0]!.n }) }}
            </p>
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
            <li v-if="lockSeen.waiting.length">{{ t('next.lockWaiting', { n: lockSeen.waiting.length, names: nameList(lockSeen.waiting) }, lockSeen.waiting.length) }}</li>
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
        <UButton icon="i-lucide-lock" :loading="busy" :disabled="!!ev.pollDays.length && !lock.day" @click="lockEvent">{{ t(lockKey) }}</UButton>
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
        <DateTimeInput v-if="reopen.mode === 'date'" v-model="reopen.when" class="w-full" :aria-label="t('next.reopenDate')" />
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

  <UModal v-model:open="previewOpen" :title="t('next.action.preview')" :description="t('next.previewHint')">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('manage.bill')">
          <UInputNumber v-model="previewTotal" :min="0" :step="1000" :format-options="{ maximumFractionDigits: 0 }" class="w-48" />
        </UFormField>
        <p v-if="!data.seats" class="text-sm text-muted">{{ t('next.previewNoSeats') }}</p>
        <template v-else-if="previewShare !== null">
          <div class="rounded-xl bg-elevated p-3 text-center">
            <p class="text-xs text-muted uppercase">{{ t('bill.perSeat') }}</p>
            <p class="text-lg font-semibold tabular-nums">{{ fmtVnd(previewShare) }}</p>
            <p class="text-xs text-muted">{{ t('bill.rounded', { n: data.seats }) }}</p>
          </div>
          <ul class="divide-y divide-default text-sm">
            <li v-for="p in payers" :key="p.memberId" class="flex items-center justify-between gap-3 py-1.5">
              <span class="truncate">{{ p.name }}<span v-if="p.guests" class="text-muted"> +{{ p.guests }}</span></span>
              <span class="font-medium tabular-nums">{{ fmtVnd(previewShare * (1 + p.guests)) }}</span>
            </li>
          </ul>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end"><UButton color="neutral" variant="ghost" @click="previewOpen = false">{{ t('close') }}</UButton></div>
    </template>
  </UModal>

  <UModal v-model:open="billOpen" :title="t('next.action.bill')">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('manage.bill')" :hint="t('next.billHint', { n: checkSeen.seats })">
          <UInputNumber v-model="bill.total" :min="0" :step="1000" :format-options="{ maximumFractionDigits: 0 }" class="w-48" />
        </UFormField>
        <!-- A fieldset, not UFormField: the field's label would name every checkbox instead of the person. -->
        <fieldset class="space-y-1">
          <legend class="text-sm font-medium text-default">{{ t('next.checkTitle') }}</legend>
          <p class="text-sm text-muted">{{ t('next.checkHint') }}</p>
          <ul class="max-h-64 divide-y divide-default overflow-y-auto text-sm">
            <li v-for="r in checkRows" :key="r.memberId" class="flex items-center gap-2 py-1.5">
              <UCheckbox
                :model-value="checkIn[r.memberId] != null"
                :disabled="isPaid(r)"
                :label="r.name"
                class="min-w-0 flex-1"
                @update:model-value="(v) => (checkIn[r.memberId] = v ? r.guests : null)"
              />
              <UBadge color="neutral" variant="subtle" size="sm" :label="checkLabel(r)" />
              <UInputNumber
                v-if="checkIn[r.memberId] != null"
                v-model="sponsor[r.memberId]"
                :min="0"
                :step="1000"
                :format-options="{ maximumFractionDigits: 0 }"
                size="xs"
                class="w-32"
                :placeholder="t('next.sponsor')"
                :disabled="isPaid(r)"
                :aria-label="t('next.sponsorOf', { name: r.name })"
              />
              <UInputNumber
                v-if="checkIn[r.memberId] != null"
                v-model="checkIn[r.memberId]"
                :min="0"
                :max="10"
                size="xs"
                class="w-24"
                :disabled="isPaid(r)"
                :aria-label="t('next.checkGuests', { name: r.name })"
              />
            </li>
          </ul>
        </fieldset>
        <p v-if="checkSeen.seats && bill.total !== null" class="text-sm text-muted">
          {{ t('next.checkShare', { n: checkSeen.seats, share: fmtVnd(checkShare ?? 0) }) }}
        </p>
        <p v-if="checkOver" class="flex items-center gap-1.5 text-sm text-error">
          <UIcon name="i-lucide-info" class="size-4 shrink-0" />{{ t('next.checkOver', { cap: plannedCap, n: checkOver }) }}
        </p>
        <UFormField :label="t('create.bank')">
          <div class="grid gap-2 sm:grid-cols-3">
            <UInput v-model="bill.bankId" :placeholder="t('create.bankId')" />
            <UInput v-model="bill.bankAccount" :placeholder="t('create.bankAccount')" inputmode="numeric" />
            <UInput v-model="bill.bankHolder" :placeholder="t('create.bankHolder')" />
          </div>
          <BankQrPreview :bank-id="bill.bankId" :bank-account="bill.bankAccount" :bank-holder="bill.bankHolder" class="mt-2" />
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
