<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date';

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
// Day picks (yes and "if need be") not yet confirmed by a reload: shown at once while the saves run in the background.
type Draft = { days: string[]; maybe: string[] };
const draft = ref<Draft | null>(null);
// Ticks on days the organizer has since removed from the poll are dropped on the next save.
const myDays = computed(() => draft.value?.days ?? (mine.value?.days ?? []).filter((d) => ev.value.pollDays.includes(d)));
const myMaybe = computed(() => draft.value?.maybe ?? (mine.value?.maybeDays ?? []).filter((d) => ev.value.pollDays.includes(d)));
type Row = EventDetail['responses'][number];
// The responses with my unsaved day picks in place, so names, counts and bars move with the tap.
const rows = computed<Row[]>(() => {
  const d = draft.value;
  const me = props.me;
  if (!d || !me) return props.data.responses;
  if (!mine.value) return [...props.data.responses, { memberId: me.id, name: me.name, days: d.days, maybeDays: d.maybe, venueIds: [], maybeVenueIds: [] } as unknown as Row];
  return props.data.responses.map((r) => (r.memberId === me.id ? { ...r, days: d.days, maybeDays: d.maybe } : r));
});
const voters = (pick: (r: Row) => boolean) => rows.value.filter(pick).map((r) => r.name);
// My vote on a place (the server list, no optimistic draft for places).
const myVote = (v: EventDetail['venues'][number]) => !!props.me && v.upvotes.includes(props.me.id);
const myMaybeVote = (v: EventDetail['venues'][number]) => !!props.me && v.maybe.includes(props.me.id);

// Past the deadline or cancelled: the poll shows results; only organizers can still fix votes.
const closed = computed(() => !!ev.value.cancelledAt || !votingOpen(ev.value));
const readOnly = computed(() => !props.role && closed.value);
const voted = computed(() => rows.value.filter(hasPicked).length);

const days = computed(() => {
  const rows = ev.value.pollDays.map((d) => ({
    day: d,
    ...dayParts(d, locale.value),
    label: fmtDay(d, locale.value),
    names: voters((r) => r.days.includes(d)),
    maybeNames: voters((r) => !r.days.includes(d) && !!r.maybeDays?.includes(d)),
  }));
  // Leader: most yes, then most "if need be" among those.
  const best = Math.max(0, ...rows.map((r) => r.names.length));
  const bestMaybe = Math.max(0, ...rows.filter((r) => r.names.length === best).map((r) => r.maybeNames.length));
  return rows.map((r) => ({ ...r, top: best > 0 && r.names.length === best && r.maybeNames.length === bestMaybe }));
});

const join = useJoin();
// The day tapped before signing in stays marked while the join sheet is open.
const pendingDay = ref<string | null>(null);
watch(join.open, (o) => !o && (pendingDay.value = null));
const on = (day: string) => myDays.value.includes(day) || pendingDay.value === day;
// One-time nudge for a first-time visitor: pulse a line over the days until they tap.
const HINT = 'te:hint:tapDays';
const hintTap = ref(false);
onMounted(() => {
  try {
    hintTap.value = !props.me && !localStorage.getItem(HINT);
  } catch {
    /* storage blocked: no hint */
  }
});
function endHint() {
  hintTap.value = false;
  try {
    localStorage.setItem(HINT, '1');
  } catch {
    /* hint may show again */
  }
}

/** Runs `fn` for a signed-in, allowed visitor; otherwise opens the join sheet and replays it after sign-in unless `already` says it holds by then. */
function act(fn: () => unknown, opts: { day?: string; already?: () => boolean } = {}) {
  // Closed: say why the tap does nothing.
  if (readOnly.value) return toast.add({ title: t(ev.value.cancelledAt ? 'poll.closedCancelled' : 'poll.closedDeadline') });
  if (!props.me) {
    endHint();
    pendingDay.value = opts.day ?? null;
    return join.ask(async () => {
      // The member may already have voted from another device: read the truth before acting.
      await refreshNuxtData(`event-${ev.value.id}`);
      await nextTick();
      if (!opts.already?.()) await fn();
    });
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
  // Anyone who answered (days, places only, or can't join): not picking a day means they're out for it.
  const answered = rows.value.filter(hasVoted);
  return {
    tie,
    answered: answered.length,
    pending: pendingVoters(props.data.participants, rows.value).length,
    days: top.map((d) => ({
      ...d,
      label: fmtDay(d.day, locale.value),
      inNames: answered.filter((r) => d.yes.includes(r.memberId)).map((r) => r.name),
      maybeNames: answered.filter((r) => d.maybe.includes(r.memberId)).map((r) => r.name),
      outNames: answered.filter((r) => !d.yes.includes(r.memberId) && !d.maybe.includes(r.memberId)).map((r) => r.name),
      honorees: honoreesOn(d.day),
    })),
  };
});

// Places get the same leader badge and share bar as days, on the same base: everyone who voted.
const placeBest = computed(() => Math.max(0, ...props.data.venues.map((v) => v.upvotes.length)));
const placeBestMaybe = computed(() => Math.max(0, ...props.data.venues.filter((v) => v.upvotes.length === placeBest.value).map((v) => v.maybe.length)));
const placeTop = (v: EventDetail['venues'][number]) => placeBest.value > 0 && v.upvotes.length === placeBest.value && v.maybe.length === placeBestMaybe.value;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

// Voting after "can't join" means the member can come after all.
const undecline = () => (mine.value?.status === 'no' ? { status: null } : {});

// One save at a time, so quick taps never land out of order; a tap during a save is sent right after it.
let savingDays = false;
// Once, after the first "if need be": a second tap does not clear it, a third does.
function tapAgainHint() {
  try {
    if (localStorage.getItem('te:hint:clear')) return;
    localStorage.setItem('te:hint:clear', '1');
  } catch {
    return;
  }
  toast.add({ title: t('hint.tapAgain') });
}

// One tap cycles a day: can go, then if need be, then nothing.
async function tapDay(day: string) {
  const without = (list: string[]) => list.filter((d) => d !== day);
  const to = myDays.value.includes(day) ? 'maybe' : myMaybe.value.includes(day) ? null : 'yes';
  if (to === 'maybe') tapAgainHint();
  draft.value = { days: to === 'yes' ? [...myDays.value, day] : without(myDays.value), maybe: to === 'maybe' ? [...myMaybe.value, day] : without(myMaybe.value) };
  if (savingDays) return;
  savingDays = true;
  const first = !mine.value || !hasPicked(mine.value);
  let sent: Draft | null = null;
  let ok = true;
  while (ok && draft.value && draft.value !== sent) {
    sent = draft.value;
    ok = await call('/response', 'PUT', { memberId: props.me!.id, days: sent.days, maybeDays: sent.maybe, ...undecline() });
  }
  savingDays = false;
  if (ok && first && (sent?.days.length || sent?.maybe.length)) confetti();
  // On failure the server's answer replaces the draft: the deadline may have passed or the list changed under us.
  if (!ok) draft.value = null;
  emit('changed');
}
// A reload that lands after the saves holds the truth.
watch(
  () => props.data,
  () => {
    if (!savingDays) draft.value = null;
  }
);

async function save(body: object) {
  const first = !mine.value || !hasPicked(mine.value);
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
usePlaceName(
  () => form.link,
  (name) => {
    if (!form.name.trim()) form.name = name;
  }
);
const voteFor = async (id: number) => {
  if (!mine.value?.venueIds.includes(id)) await save({ venueIds: [...(mine.value?.venueIds ?? []), id], maybeVenueIds: (mine.value?.maybeVenueIds ?? []).filter((v) => v !== id) });
};
// A place cycles like a day: can go, if need be, nothing.
const tapPlace = (id: number) => {
  const yes = mine.value?.venueIds ?? [];
  const maybe = mine.value?.maybeVenueIds ?? [];
  const without = (list: number[]) => list.filter((v) => v !== id);
  const to = yes.includes(id) ? 'maybe' : maybe.includes(id) ? null : 'yes';
  if (to === 'maybe') tapAgainHint();
  return save({ venueIds: to === 'yes' ? [...yes, id] : without(yes), maybeVenueIds: to === 'maybe' ? [...maybe, id] : without(maybe) });
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
      <UAlert
        v-if="data.votesHidden"
        color="info"
        variant="subtle"
        icon="i-lucide-eye-off"
        :title="t('poll.votesHidden')"
        :description="t('poll.answeredOf', { n: data.responses.filter((r) => r.voted).length, total: data.participants.length })"
      />
      <p v-if="hintTap && !closed" class="text-sm font-medium text-primary motion-safe:animate-pulse">👆 {{ t('hint.tapDays') }}</p>
    </div>

    <div v-if="ev.pollDays.length" class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap">
        <div class="flex min-w-0 gap-3 sm:flex-1">
          <UIcon name="i-lucide-calendar-days" class="mt-1 size-5 shrink-0 text-highlighted" />
          <div class="min-w-0">
            <h2 class="flex items-center gap-1 text-lg font-semibold text-highlighted">
              {{ t(closed ? 'poll.daysResult' : 'poll.days') }}
              <UPopover v-if="!closed">
                <UButton icon="i-lucide-circle-help" color="neutral" variant="link" size="xs" :aria-label="t('poll.daysHint')" />
                <template #content><p class="max-w-xs p-3 text-sm text-muted">{{ t('poll.daysHint') }}</p></template>
              </UPopover>
            </h2>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge v-if="me" :color="myDays.length ? 'primary' : 'neutral'" variant="soft" class="rounded-full px-2.5 tabular-nums" :label="t('poll.picked', { n: myDays.length, total: ev.pollDays.length })" />
          <UButton v-if="can(role, 'edit')" size="sm" variant="outline" color="neutral" icon="i-lucide-calendar-cog" @click="daysOpen = true">{{ t('days.edit') }}</UButton>
        </div>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        <div v-for="d in days" :key="d.day" class="flex flex-col gap-1.5">
        <UTooltip :delay-duration="0" :text="[...d.names, ...d.maybeNames.map((n) => `${n} (${t('poll.ifNeedBeState')})`)].join(', ')" :disabled="!d.names.length && !d.maybeNames.length">
          <button
            type="button"
            :aria-pressed="myDays.includes(d.day) ? 'true' : myMaybe.includes(d.day) ? 'mixed' : 'false'"
            :aria-disabled="readOnly"
            :aria-label="t('poll.dayLabel', { day: d.label, people: t('poll.people', d.names.length), state: t(myDays.includes(d.day) ? 'poll.selected' : myMaybe.includes(d.day) ? 'poll.ifNeedBeState' : 'poll.notSelected') })"
            class="day-tile themed-tile relative flex w-full flex-col items-start gap-1 p-4 text-left transition focus-visible:outline-2 focus-visible:outline-primary not-aria-disabled:active:scale-[0.97] motion-reduce:active:scale-100 aria-disabled:cursor-not-allowed"
            :class="myMaybe.includes(d.day) && 'border-dashed'"
            :data-on="on(d.day)"
            @click="act(() => tapDay(d.day), { day: d.day, already: () => myDays.includes(d.day) || myMaybe.includes(d.day) })"
          >
            <!-- Closed: no empty checkbox inviting a tap, only the check on days you picked. -->
            <span
              v-if="!readOnly || myDays.includes(d.day) || myMaybe.includes(d.day)"
              class="absolute top-3 right-3 grid size-5 place-items-center rounded-full transition"
              :class="on(d.day) ? 'bg-primary text-inverted' : myMaybe.includes(d.day) ? 'bg-warning/20 text-warning ring-1 ring-warning ring-inset' : 'ring-1 ring-accented ring-inset'"
              aria-hidden="true"
            >
              <UIcon v-if="on(d.day)" name="i-lucide-check" class="size-3.5" />
              <UIcon v-else-if="myMaybe.includes(d.day)" name="i-lucide-tilde" class="size-3.5" />
            </span>
            <span class="text-xs font-medium text-muted">{{ d.weekday }}</span>
            <span class="text-lg font-semibold text-highlighted">{{ d.date }}</span>
            <span v-if="myMaybe.includes(d.day)" class="text-xs font-medium text-warning">{{ t('poll.ifNeedBe') }}</span>
            <span class="mt-1 flex items-center gap-1.5 text-xs text-muted tabular-nums">
              <UIcon name="i-lucide-users-round" class="size-3.5 text-dimmed" />
              {{ t('poll.chosen', { n: d.names.length }) }}<template v-if="d.maybeNames.length"> · {{ t('poll.maybeChosen', { n: d.maybeNames.length }) }}</template>
            </span>
            <span v-if="d.top" class="day-lead flex items-center gap-1 text-xs font-semibold text-primary"><UIcon name="i-lucide-star" class="size-3.5" />{{ t('poll.top') }}</span>
            <span v-if="ev.honorees.length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="h in honoreesOn(d.day)"
                :key="h.id"
                class="rounded-full px-1.5 text-xs"
                :class="h.in ? 'bg-success/15 text-success' : 'bg-elevated text-dimmed line-through'"
              >🎂 {{ h.name }}<span class="sr-only"> {{ t(h.in ? 'poll.honoreeIn' : 'poll.honoreeOut') }}</span></span>
            </span>
            <span v-if="voted" class="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-accented" aria-hidden="true">
              <span class="block h-full rounded-full bg-primary/70" :style="{ width: `${(d.names.length / voted) * 100}%` }" />
            </span>
          </button>
        </UTooltip>
        </div>
        <UPopover v-if="!readOnly && me" v-model:open="dayOpen">
          <button type="button" class="themed-tile flex min-h-24 w-full items-center justify-center gap-1.5 border-dashed p-4 text-sm text-muted focus-visible:outline-2 focus-visible:outline-primary">
            <UIcon name="i-lucide-plus" class="size-4" />{{ t('poll.suggestDay') }}
          </button>
          <template #content>
            <UCalendar :min-value="today" :week-starts-on="1" :aria-label="t('poll.suggestDay')" class="p-2" @update:model-value="suggestDay" />
          </template>
        </UPopover>
      </div>

      <section v-if="compare" class="space-y-3 rounded-xl border border-default p-4" :aria-label="t('compare.title')">
        <h3 class="flex items-center gap-2 font-semibold text-highlighted"><UIcon name="i-lucide-columns-3" class="size-4 text-muted" />{{ t('compare.title') }}</h3>
        <p v-if="compare.tie" class="text-sm text-warning">{{ t(compare.tie === 'honorees' ? 'compare.tieHonorees' : 'compare.tieEarlier', { day: compare.days[0]!.label, n: compare.days[0]!.n }) }}</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div v-for="(d, i) in compare.days" :key="d.day" class="min-w-0 space-y-2 rounded-lg bg-elevated/50 p-3 text-sm">
            <p class="flex items-baseline justify-between gap-2">
              <span class="font-semibold text-highlighted">{{ d.label }}</span>
              <!-- Same number as the "can come" list (a vote is a yes), so show it once, against everyone who answered. -->
              <span class="text-muted tabular-nums"><span class="font-semibold text-success">{{ d.inNames.length }}</span>/{{ compare.answered }}</span>
            </p>
            <UBadge v-if="i === 0" color="primary" variant="subtle" size="sm" :label="t(compare.tie === 'earlier' ? 'compare.provisional' : 'compare.suggested')" />
            <p v-if="d.honorees.length" class="flex flex-wrap gap-1">
              <span v-for="h in d.honorees" :key="h.id" :class="h.in ? 'text-success' : 'text-dimmed line-through'">🎂 {{ h.name }}</span>
            </p>
            <p class="break-words"><span class="font-medium text-success">{{ t('compare.in') }}</span> <span class="text-muted">{{ d.inNames.join(', ') }}</span></p>
            <p v-if="d.maybeNames.length" class="break-words"><span class="font-medium text-warning">{{ t('compare.maybe') }}</span> <span class="text-muted">{{ d.maybeNames.join(', ') }}</span></p>
            <details v-if="d.outNames.length" class="break-words">
              <summary class="cursor-pointer text-muted">{{ t('compare.out', { n: d.outNames.length }) }}</summary>
              <p class="mt-1 text-dimmed">{{ d.outNames.join(', ') }}</p>
            </details>
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
            <h2 class="flex items-center gap-1 text-lg font-semibold text-highlighted">
              {{ closed ? t('poll.venuesResult') : ev.pollDays.length ? t('poll.venues') : t('poll.placeQ') }}
              <UPopover v-if="!closed">
                <UButton icon="i-lucide-circle-help" color="neutral" variant="link" size="xs" :aria-label="t('poll.placesHint')" />
                <template #content><p class="max-w-xs p-3 text-sm text-muted">{{ t('poll.placesHint') }}</p></template>
              </UPopover>
            </h2>
          </div>
        </div>
      </div>

      <div v-if="!data.venues.length" class="flex flex-col gap-3 themed-tile p-4 sm:flex-row sm:items-center">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-elevated text-muted"><UIcon name="i-lucide-map-pin" class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted">{{ t('poll.noVenuesTitle') }}</p>
          <p class="text-sm text-muted">{{ t('poll.noVenues') }}</p>
        </div>
        <UButton v-if="!readOnly" size="sm" color="primary" variant="outline" icon="i-lucide-plus" class="self-start sm:self-center" @click="act(() => (showForm = true))">{{ t('poll.suggestPlace') }}</UButton>
      </div>
      <div
        v-for="v in data.venues"
        :key="v.id"
        class="themed-tile relative flex items-center gap-3 p-4 transition"
        :data-on="myVote(v)"
      >
        <UBadge
          v-if="placeTop(v)"
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
              {{ v.name }}<UIcon v-if="!mapEmbedUrl(v.name, v.link)" name="i-lucide-arrow-up-right" class="ml-0.5 size-3.5 align-[-2px] text-dimmed" />
            </ULink>
            <template v-else>{{ v.name }}</template>
            <VenueMap :name="v.name" :link="v.link" />
          </p>
          <p v-if="v.note" class="text-sm text-muted">{{ v.note }}</p>
          <p class="text-xs text-dimmed">{{ t('poll.suggestedBy', { name: v.addedByName }) }}</p>
          <!-- Count and share sit together under the bar's start, as on the day tiles; hidden until anyone has voted (all zeros is noise). -->
          <span v-if="voted" class="mt-2 flex items-center gap-2">
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-accented" aria-hidden="true">
              <span class="block h-full rounded-full bg-primary/70" :style="{ width: `${pct(v.upvotes.length, voted)}%` }" />
            </span>
            <span class="shrink-0 text-xs text-muted tabular-nums">{{ t('poll.votes', v.upvotes.length) }}<template v-if="v.maybe.length"> · {{ t('poll.maybeChosen', { n: v.maybe.length }) }}</template> · {{ pct(v.upvotes.length, voted) }}%</span>
          </span>
        </div>
        <UButton
          v-if="!readOnly || myVote(v) || myMaybeVote(v)"
          :disabled="busy || readOnly"
          :color="myVote(v) ? 'primary' : myMaybeVote(v) ? 'warning' : 'neutral'"
          :variant="myVote(v) || myMaybeVote(v) ? 'soft' : 'outline'"
          :icon="myVote(v) ? 'i-lucide-check' : myMaybeVote(v) ? 'i-lucide-minus' : 'i-lucide-plus'"
          :label="t(myVote(v) ? 'poll.myVote' : myMaybeVote(v) ? 'poll.ifNeedBe' : 'poll.vote')"
          class="shrink-0"
          :aria-pressed="myVote(v) ? 'true' : myMaybeVote(v) ? 'mixed' : 'false'"
          :aria-label="t('poll.voteFor', { name: v.name })"
          @click="act(() => tapPlace(v.id), { already: () => myVote(v) || myMaybeVote(v) })"
        />
        <UDropdownMenu v-if="can(role, 'removeVenue')" :items="[{ label: t('poll.removePlace'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => (removing = v) }]">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis-vertical" class="-mr-2 shrink-0" :aria-label="t('poll.placeActions', { name: v.name })" />
        </UDropdownMenu>
      </div>
      <UButton v-if="!readOnly && data.venues.length" size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" @click="act(() => (showForm = true))">{{ t('poll.suggestPlace') }}</UButton>
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
