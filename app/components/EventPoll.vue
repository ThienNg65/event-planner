<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date';
import { compareDays } from '~~/shared/utils/event';

const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null; role: Role }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const toast = useToast();
const { busy, call, error } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const ev = computed(() => props.data.event);
const mine = computed(() => props.data.responses.find((r) => r.memberId === props.me?.id));
// Day picks not yet confirmed by a reload: shown at once while the saves run in the background.
const draftDays = ref<string[] | null>(null);
// Ticks on days the organizer has since removed from the poll are dropped on the next save.
const myDays = computed(() => draftDays.value ?? (mine.value?.days ?? []).filter((d) => ev.value.pollDays.includes(d)));
type Row = EventDetail['responses'][number];
// The responses with my unsaved day picks in place, so names, counts and bars move with the tap.
const rows = computed<Row[]>(() => {
  const days = draftDays.value;
  const me = props.me;
  if (!days || !me) return props.data.responses;
  if (!mine.value) return [...props.data.responses, { memberId: me.id, name: me.name, days, venueIds: [] } as unknown as Row];
  return props.data.responses.map((r) => (r.memberId === me.id ? { ...r, days } : r));
});
const voters = (pick: (r: Row) => boolean) => rows.value.filter(pick).map((r) => r.name);
const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
// My vote on a place (the server list, no optimistic draft for places).
const myVote = (v: EventDetail['venues'][number]) => !!props.me && v.upvotes.includes(props.me.id);

// Closed (deadline passed or cancelled): participants see the results, organizers can still fix votes.
// Past the deadline or cancelled: the poll shows results (organizers can still fix votes).
const closed = computed(() => !!ev.value.cancelledAt || !votingOpen(ev.value));
const readOnly = computed(() => !props.role && (!!ev.value.cancelledAt || !votingOpen(ev.value)));
const voted = computed(() => rows.value.filter((r) => r.days.length || r.venueIds.length).length);

const days = computed(() => {
  const rows = ev.value.pollDays.map((d) => ({ day: d, ...dayParts(d, locale.value), label: fmtDay(d, locale.value), names: voters((r) => r.days.includes(d)) }));
  const best = Math.max(0, ...rows.map((r) => r.names.length));
  return rows.map((r) => ({ ...r, top: best > 0 && r.names.length === best }));
});

/** Runs `fn` for a signed-in, allowed visitor; otherwise points to the "who are you" card instead of a silent no-op. */
function act(fn: () => unknown) {
  // Closed: say why the tap does nothing.
  if (readOnly.value) return toast.add({ title: t(ev.value.cancelledAt ? 'poll.closedCancelled' : 'poll.closedDeadline') });
  if (!props.me) {
    // The "who are you" card is gone once voting closes (an organizer with a manage key can still edit): say so instead.
    const who = document.getElementById('who');
    return who ? who.scrollIntoView({ behavior: 'smooth', block: 'start' }) : toast.add({ title: t('next.who.link') });
  }
  return fn();
}

// Honorees (who the event is for) and whether they can make a day: on every tile, so everyone sees it.
const { members } = useMe();
const nameOf = (id: number) => members.value.find((m) => m.id === id)?.name ?? props.data.responses.find((r) => r.memberId === id)?.name ?? '?';
const honoreesOn = (day: string) => ev.value.honorees.map((id) => ({ id, name: nameOf(id), in: rows.value.some((r) => r.memberId === id && r.days.includes(day)) }));

// Organizers compare the top days side by side: who is in, who answered but is out, and which honorees can come.
const compare = computed(() => {
  if (!can(props.role, 'edit')) return null;
  const { ranked, tie } = compareDays(ev.value.pollDays, rows.value, ev.value.honorees);
  const top = ranked.filter((d) => d.n > 0).slice(0, 3);
  if (top.length < 2) return null;
  const answered = rows.value.filter((r) => r.days.length || r.status === 'no');
  return {
    tie,
    pending: pendingVoters(members.value, rows.value).length,
    days: top.map((d) => ({
      ...d,
      label: fmtDay(d.day, locale.value),
      inNames: answered.filter((r) => d.yes.includes(r.memberId)).map((r) => r.name),
      outNames: answered.filter((r) => !d.yes.includes(r.memberId)).map((r) => r.name),
      honorees: honoreesOn(d.day),
    })),
  };
});

// Places get the same leader badge and share bar as days, on the same base: everyone who voted.
const placeBest = computed(() => Math.max(0, ...props.data.venues.map((v) => v.upvotes.length)));
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

// Voting after "can't join" means the member can come after all.
const undecline = () => (mine.value?.status === 'no' ? { status: null } : {});

// One save at a time, so quick taps never land out of order; a tap during a save is sent right after it.
let savingDays = false;
async function tapDay(day: string) {
  draftDays.value = toggle(myDays.value, day);
  if (savingDays) return;
  savingDays = true;
  const first = !mine.value?.days.length && !mine.value?.venueIds.length;
  let sent: string[] | null = null;
  let ok = true;
  while (ok && draftDays.value && draftDays.value !== sent) {
    sent = draftDays.value;
    ok = await call('/response', 'PUT', { memberId: props.me!.id, days: sent, ...undecline() });
  }
  savingDays = false;
  if (ok && first && sent?.length) confetti();
  // On failure the server's answer replaces the draft: the deadline may have passed or the list changed under us.
  if (!ok) draftDays.value = null;
  emit('changed');
}
// A reload that lands after the saves holds the truth.
watch(
  () => props.data,
  () => {
    if (!savingDays) draftDays.value = null;
  }
);

async function save(body: object) {
  const first = !mine.value?.days.length && !mine.value?.venueIds.length;
  const ok = await call('/response', 'PUT', { memberId: props.me!.id, ...body, ...undecline() });
  if (ok && first) confetti();
  // Also on failure: the deadline may have passed or the list changed under us.
  emit('changed');
}

const today = parseDate(toTeamInput(new Date().toISOString()).slice(0, 10));
const dayOpen = ref(false);
const daysOpen = ref(false);
async function suggestDay(v: unknown) {
  if (!v || Array.isArray(v) || !('year' in (v as object))) return;
  const day = (v as DateValue).toString();
  if (ev.value.pollDays.includes(day)) toast.add({ title: t('poll.dup') });
  if (await call('/days', 'POST', { day, memberId: props.me!.id })) dayOpen.value = false;
  emit('changed');
}

const showForm = ref(false);
const form = reactive({ name: '', link: '', note: '' });
const voteFor = async (id: number) => {
  if (!mine.value?.venueIds.includes(id)) await save({ venueIds: [...(mine.value?.venueIds ?? []), id] });
};
async function suggest() {
  const same = props.data.venues.find((v) => norm(v.name) === norm(form.name));
  if (same) {
    toast.add({ title: t('poll.dup') });
    await voteFor(same.id);
  } else if (await call('/venues', 'POST', { ...form, addedBy: props.me!.id })) {
    emit('changed');
  } else {
    // Someone added it after our list loaded: the server names the existing place, so vote for that one.
    const dupId = (error.value as { data?: { data?: { id?: number } } } | null)?.data?.data?.id;
    if (dupId === undefined) return;
    await voteFor(dupId);
  }
  Object.assign(form, { name: '', link: '', note: '' });
  showForm.value = false;
}

const removing = ref<EventDetail['venues'][number] | null>(null);
const removeOpen = computed({ get: () => !!removing.value, set: (o) => !o && (removing.value = null) });
async function remove() {
  if (removing.value && (await call(`/venues/${removing.value.id}`, 'DELETE'))) emit('changed');
  removing.value = null;
}
</script>

<template>
  <section id="poll" class="scroll-mt-4 space-y-6">
    <div class="space-y-1">
      <p v-if="!me && !closed" class="text-sm">
        <button type="button" class="text-primary underline underline-offset-2" @click="act(() => {})">{{ t('poll.pickName') }}</button>
      </p>
    </div>

    <div v-if="ev.pollDays.length" class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap">
        <div class="flex min-w-0 gap-3 sm:flex-1">
          <UIcon name="i-lucide-calendar-days" class="mt-1 size-5 shrink-0 text-highlighted" />
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-highlighted">{{ t(closed ? 'poll.daysResult' : 'poll.days') }}</h2>
            <p v-if="!closed" class="text-sm text-muted">{{ t('poll.daysHint') }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge v-if="me" :color="myDays.length ? 'primary' : 'neutral'" variant="soft" class="rounded-full px-2.5 tabular-nums" :label="t('poll.picked', { n: myDays.length, total: ev.pollDays.length })" />
          <UButton v-if="can(role, 'edit')" size="sm" variant="outline" color="neutral" icon="i-lucide-calendar-cog" @click="daysOpen = true">{{ t('days.edit') }}</UButton>
          <UPopover v-if="!readOnly && me" v-model:open="dayOpen">
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-plus" :loading="busy">{{ t('poll.suggestDay') }}</UButton>
            <template #content>
              <UCalendar :min-value="today" :week-starts-on="1" :aria-label="t('poll.suggestDay')" class="p-2" @update:model-value="suggestDay" />
            </template>
          </UPopover>
        </div>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        <UTooltip v-for="d in days" :key="d.day" :delay-duration="0" :text="d.names.join(', ')" :disabled="!d.names.length">
          <button
            type="button"
            :aria-pressed="myDays.includes(d.day)"
            :aria-disabled="readOnly"
            :aria-label="t('poll.dayLabel', { day: d.label, people: t('poll.people', d.names.length), state: t(myDays.includes(d.day) ? 'poll.selected' : 'poll.notSelected') })"
            class="themed-tile relative flex w-full flex-col items-start gap-1 p-4 text-left transition focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed"
            :data-on="myDays.includes(d.day)"
            @click="act(() => tapDay(d.day))"
          >
            <UBadge v-if="d.top" color="warning" variant="solid" size="sm" icon="i-lucide-crown" :label="t('poll.top')" class="absolute -top-2.5 left-3 shadow-sm" />
            <!-- Closed: no empty checkbox inviting a tap, only the check on days you picked. -->
            <span
              v-if="!readOnly || myDays.includes(d.day)"
              class="absolute top-3 right-3 grid size-5 place-items-center rounded-full transition"
              :class="myDays.includes(d.day) ? 'bg-primary text-inverted' : 'ring-1 ring-accented ring-inset'"
              aria-hidden="true"
            >
              <UIcon v-if="myDays.includes(d.day)" name="i-lucide-check" class="size-3.5" />
            </span>
            <span class="text-xs font-medium text-muted">{{ d.weekday }}</span>
            <span class="text-lg font-semibold text-highlighted">{{ d.date }}</span>
            <span class="mt-1 flex items-center gap-1.5 text-xs text-muted tabular-nums">
              <UIcon name="i-lucide-users-round" class="size-3.5 text-dimmed" />
              {{ t('poll.chosen', { n: d.names.length }) }}
            </span>
            <span v-if="ev.honorees.length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="h in honoreesOn(d.day)"
                :key="h.id"
                class="rounded-full px-1.5 text-xs"
                :class="h.in ? 'bg-success/15 text-success' : 'bg-elevated text-dimmed line-through'"
              >🎂 {{ h.name }}<span class="sr-only"> {{ t(h.in ? 'poll.honoreeIn' : 'poll.honoreeOut') }}</span></span>
            </span>
            <span class="mt-2 flex w-full items-center gap-2" aria-hidden="true">
              <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-accented">
                <span class="block h-full rounded-full bg-primary/70" :style="{ width: `${voted ? (d.names.length / voted) * 100 : 0}%` }" />
              </span>
              <span class="w-8 text-right text-xs text-muted tabular-nums">{{ voted ? Math.round((d.names.length / voted) * 100) : 0 }}%</span>
            </span>
          </button>
        </UTooltip>
      </div>

      <section v-if="compare" class="space-y-3 rounded-xl border border-default p-4" :aria-label="t('compare.title')">
        <h3 class="flex items-center gap-2 font-semibold text-highlighted"><UIcon name="i-lucide-columns-3" class="size-4 text-muted" />{{ t('compare.title') }}</h3>
        <p v-if="compare.tie" class="text-sm text-warning">{{ t(compare.tie === 'honorees' ? 'compare.tieHonorees' : 'compare.tieEarlier', { day: compare.days[0]!.label, n: compare.days[0]!.n }) }}</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div v-for="(d, i) in compare.days" :key="d.day" class="space-y-2 rounded-lg bg-elevated/50 p-3 text-sm">
            <p class="flex items-baseline justify-between gap-2">
              <span class="font-semibold text-highlighted">{{ d.label }}</span>
              <span class="text-muted tabular-nums">{{ t('poll.votes', d.n) }}</span>
            </p>
            <UBadge v-if="i === 0" color="primary" variant="subtle" size="sm" :label="t('compare.suggested')" />
            <p v-if="d.honorees.length" class="flex flex-wrap gap-1">
              <span v-for="h in d.honorees" :key="h.id" :class="h.in ? 'text-success' : 'text-dimmed line-through'">🎂 {{ h.name }}</span>
            </p>
            <p><span class="font-medium text-success">{{ t('compare.in', { n: d.inNames.length }) }}</span> <span class="text-muted">{{ d.inNames.join(', ') }}</span></p>
            <p v-if="d.outNames.length"><span class="font-medium text-error">{{ t('compare.out', { n: d.outNames.length }) }}</span> <span class="text-muted">{{ d.outNames.join(', ') }}</span></p>
          </div>
        </div>
        <p v-if="compare.pending" class="text-xs text-muted">{{ t('compare.pending', { n: compare.pending }) }}</p>
      </section>
    </div>

    <div v-if="!ev.venue" class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap">
        <div class="flex min-w-0 gap-3 sm:flex-1">
          <UIcon name="i-lucide-map-pin" class="mt-1 size-5 shrink-0 text-highlighted" />
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-highlighted">{{ closed ? t('poll.venuesResult') : ev.pollDays.length ? t('poll.venues') : t('poll.placeQ') }}</h2>
            <p v-if="!closed" class="text-sm text-muted">{{ t('poll.venuesHint') }}</p>
          </div>
        </div>
        <UButton v-if="!readOnly && me && data.venues.length" size="sm" color="neutral" variant="outline" icon="i-lucide-plus" @click="showForm = true">{{ t('poll.suggestPlace') }}</UButton>
      </div>

      <div v-if="!data.venues.length" class="flex flex-col gap-3 themed-tile p-4 sm:flex-row sm:items-center">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-elevated text-muted"><UIcon name="i-lucide-map-pin" class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted">{{ t('poll.noVenuesTitle') }}</p>
          <p class="text-sm text-muted">{{ t('poll.noVenues') }}</p>
        </div>
        <UButton v-if="!readOnly && me" size="sm" color="primary" variant="outline" icon="i-lucide-plus" class="self-start sm:self-center" @click="showForm = true">{{ t('poll.suggestPlace') }}</UButton>
      </div>
      <div
        v-for="v in data.venues"
        :key="v.id"
        class="themed-tile relative flex items-center gap-3 p-4 transition"
        :data-on="myVote(v)"
      >
        <UBadge
          v-if="placeBest > 0 && v.upvotes.length === placeBest"
          color="warning"
          variant="solid"
          size="sm"
          icon="i-lucide-crown"
          :label="t('poll.top')"
          class="absolute -top-2.5 left-3 shadow-sm"
        />
        <div class="min-w-0 flex-1">
          <!-- The name is the link; no separate button for it. -->
          <p class="font-medium break-words text-highlighted">
            <ULink v-if="v.link" :to="v.link" target="_blank" rel="noopener noreferrer" raw class="hover:underline">
              {{ v.name }}<UIcon name="i-lucide-arrow-up-right" class="ml-0.5 size-3.5 align-[-2px] text-dimmed" />
            </ULink>
            <template v-else>{{ v.name }}</template>
          </p>
          <p v-if="v.note" class="text-sm text-muted">{{ v.note }}</p>
          <p class="text-xs text-dimmed">{{ t('poll.suggestedBy', { name: v.addedByName }) }}</p>
          <!-- Count and share sit together under the bar's start, as on the day tiles. -->
          <span class="mt-2 flex items-center gap-2">
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-accented" aria-hidden="true">
              <span class="block h-full rounded-full bg-primary/70" :style="{ width: `${pct(v.upvotes.length, voted)}%` }" />
            </span>
            <span class="shrink-0 text-xs text-muted tabular-nums">{{ t('poll.votes', v.upvotes.length) }} · {{ pct(v.upvotes.length, voted) }}%</span>
          </span>
        </div>
        <UButton
          v-if="!readOnly || myVote(v)"
          :disabled="busy || readOnly"
          :color="myVote(v) ? 'primary' : 'neutral'"
          :variant="myVote(v) ? 'soft' : 'outline'"
          :icon="myVote(v) ? 'i-lucide-check' : 'i-lucide-plus'"
          :label="t(myVote(v) ? 'poll.myVote' : 'poll.vote')"
          class="shrink-0"
          :aria-pressed="myVote(v)"
          :aria-label="t('poll.voteFor', { name: v.name })"
          @click="act(() => save({ venueIds: toggle(mine?.venueIds ?? [], v.id) }))"
        />
        <UDropdownMenu v-if="can(role, 'removeVenue')" :items="[{ label: t('poll.removePlace'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => (removing = v) }]">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis-vertical" class="-mr-2 shrink-0" :aria-label="t('poll.placeActions', { name: v.name })" />
        </UDropdownMenu>
      </div>
    </div>

    <UModal v-model:open="showForm" :title="t('poll.suggestPlace')">
      <template #body>
        <form id="suggest-place" class="space-y-2" @submit.prevent="suggest">
          <UInput v-model="form.name" :maxlength="100" :placeholder="t('create.venue')" required class="w-full" />
          <UInput v-model="form.link" type="url" :placeholder="t('create.venueLink')" class="w-full" />
          <UInput v-model="form.note" :maxlength="300" :placeholder="t('create.note')" class="w-full" />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showForm = false">{{ t('cancel') }}</UButton>
          <UButton type="submit" form="suggest-place" :loading="busy" :disabled="!form.name.trim()">{{ t('poll.add') }}</UButton>
        </div>
      </template>
    </UModal>

    <EventDaysDialog v-if="can(role, 'edit')" v-model:open="daysOpen" :data="data" :manage-key="manageKey" @changed="emit('changed')" />

    <UModal v-model:open="removeOpen" :title="t('poll.removeTitle', { name: removing?.name ?? '' })">
      <template #body>
        <p class="text-sm text-muted">{{ t('poll.removeBody', { n: removing?.upvotes.length ?? 0 }, removing?.upvotes.length ?? 0) }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" autofocus @click="removing = null">{{ t('cancel') }}</UButton>
          <UButton color="error" :loading="busy" @click="remove">{{ t('poll.remove') }}</UButton>
        </div>
      </template>
    </UModal>
  </section>
</template>
