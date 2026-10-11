<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date';

const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null; role: Role }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const toast = useToast();
const { members } = useMe();
const { busy, call, error } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const ev = computed(() => props.data.event);
const mine = computed(() => props.data.responses.find((r) => r.memberId === props.me?.id));
// Ticks on days the organizer has since removed from the poll are dropped on the next save.
const myDays = computed(() => (mine.value?.days ?? []).filter((d) => ev.value.pollDays.includes(d)));
const voters = (pick: (r: EventDetail['responses'][number]) => boolean) =>
  props.data.responses.filter(pick).map((r) => r.name);
const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

// Closed (deadline passed or cancelled): participants see the results, organizers can still fix votes.
const readOnly = computed(() => !props.role && (!!ev.value.cancelledAt || !votingOpen(ev.value)));
const voted = computed(() => props.data.responses.filter((r) => r.days.length || r.venueIds.length).length);
const closes = computed(() => (ev.value.voteDeadline ? fmtDateTime(ev.value.voteDeadline, locale.value) : ''));

const days = computed(() => {
  const rows = ev.value.pollDays.map((d) => ({ day: d, ...dayParts(d, locale.value), names: voters((r) => r.days.includes(d)) }));
  const best = Math.max(0, ...rows.map((r) => r.names.length));
  return rows.map((r) => ({ ...r, top: best > 0 && r.names.length === best }));
});

/** Runs `fn` for a signed-in, allowed visitor; otherwise points to the "who are you" card instead of a silent no-op. */
function act(fn: () => unknown) {
  if (!props.me) return document.getElementById('who')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!readOnly.value) return fn();
}

async function save(body: object) {
  const first = !mine.value?.days.length && !mine.value?.venueIds.length;
  const ok = await call('/response', 'PUT', { memberId: props.me!.id, ...body });
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
  <section id="poll" class="scroll-mt-4 space-y-8">
    <div class="space-y-1">
      <p class="text-sm text-muted tabular-nums">
        {{ t('poll.progress', { n: voted, total: Math.max(members.length, voted) }) }}<template v-if="closes"> · {{ t('poll.closes', { when: closes }) }}</template>
      </p>
      <p v-if="readOnly" class="flex items-center gap-1.5 text-sm text-warning"><UIcon name="i-lucide-lock" class="size-4" />{{ t('poll.closed') }}</p>
      <p v-else-if="!me" class="text-sm">
        <button type="button" class="text-primary underline underline-offset-2" @click="act(() => {})">{{ t('poll.pickName') }}</button>
      </p>
    </div>

    <div v-if="ev.pollDays.length" class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-highlighted">{{ t('poll.days') }}</h2>
        <div class="flex items-center gap-2">
          <UButton v-if="can(role, 'edit')" size="sm" variant="outline" color="neutral" icon="i-lucide-calendar-cog" @click="daysOpen = true">{{ t('days.edit') }}</UButton>
          <UPopover v-if="!readOnly && me" v-model:open="dayOpen">
            <UButton size="sm" variant="soft" icon="i-lucide-plus" :loading="busy">{{ t('poll.suggestDay') }}</UButton>
            <template #content>
              <UCalendar :min-value="today" :week-starts-on="1" :aria-label="t('poll.suggestDay')" class="p-2" @update:model-value="suggestDay" />
            </template>
          </UPopover>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <button
          v-for="d in days"
          :key="d.day"
          type="button"
          :aria-pressed="myDays.includes(d.day)"
          :disabled="busy || readOnly"
          :title="d.names.join(', ')"
          class="relative flex flex-col items-center gap-0.5 rounded-xl p-3 text-center ring transition focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
          :class="[
            myDays.includes(d.day) ? 'bg-primary/10 ring-2 ring-primary' : 'ring-default enabled:hover:bg-elevated',
            d.top && !myDays.includes(d.day) && 'ring-secondary',
          ]"
          @click="act(() => save({ days: toggle(myDays, d.day) }))"
        >
          <UIcon v-if="myDays.includes(d.day)" name="i-lucide-circle-check" class="absolute top-1.5 left-1.5 size-4 text-primary" />
          <span v-if="d.top" class="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-secondary text-inverted shadow-sm" :title="t('poll.top')">
            <UIcon name="i-lucide-crown" class="size-3.5" />
          </span>
          <span class="text-xs font-medium text-muted uppercase">{{ d.weekday }}</span>
          <span class="font-semibold text-highlighted">{{ d.date }}</span>
          <span class="mt-1 flex h-5 items-center gap-1">
            <UAvatarGroup v-if="d.names.length" :max="3" size="3xs">
              <UAvatar v-for="n in d.names" :key="n" :alt="n" />
            </UAvatarGroup>
            <span class="text-xs text-muted tabular-nums">{{ d.names.length }}</span>
          </span>
        </button>
      </div>
    </div>

    <div v-if="!ev.venue" class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-highlighted">{{ ev.pollDays.length ? t('poll.venues') : t('poll.placeQ') }}</h2>
        <UButton v-if="!readOnly && me" size="sm" variant="soft" :icon="showForm ? 'i-lucide-x' : 'i-lucide-plus'" @click="showForm = !showForm">
          {{ showForm ? t('cancel') : t('poll.suggestPlace') }}
        </UButton>
      </div>

      <form v-if="showForm" class="space-y-2 rounded-xl p-3 ring ring-default" @submit.prevent="suggest">
        <UInput v-model="form.name" :maxlength="100" :placeholder="t('create.venue')" required class="w-full" />
        <UInput v-model="form.link" type="url" :placeholder="t('create.venueLink')" class="w-full" />
        <UInput v-model="form.note" :maxlength="300" :placeholder="t('create.note')" class="w-full" />
        <UButton type="submit" :loading="busy" :disabled="!form.name.trim()">{{ t('poll.add') }}</UButton>
      </form>

      <p v-if="!data.venues.length" class="text-sm text-muted">{{ t('poll.noVenues') }}</p>
      <div
        v-for="v in data.venues"
        :key="v.id"
        class="flex items-center gap-3 rounded-xl p-3 ring transition"
        :class="me && v.upvotes.includes(me.id) ? 'bg-primary/10 ring-2 ring-primary' : 'ring-default'"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">
            <ULink v-if="v.link" :to="v.link" target="_blank" rel="noopener noreferrer">{{ v.name }}</ULink>
            <template v-else>{{ v.name }}</template>
          </p>
          <p v-if="v.note" class="text-sm text-muted">{{ v.note }}</p>
          <p class="text-xs text-dimmed">{{ t('poll.suggestedBy', { name: v.addedByName }) }}</p>
        </div>
        <UButton
          v-if="can(role, 'removeVenue')"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          :aria-label="t('poll.remove')"
          @click="removing = v"
        />
        <UButton
          :disabled="busy || readOnly"
          :variant="me && v.upvotes.includes(me.id) ? 'solid' : 'outline'"
          :icon="me && v.upvotes.includes(me.id) ? 'i-lucide-circle-check' : 'i-lucide-thumbs-up'"
          :label="String(v.upvotes.length)"
          :aria-pressed="!!me && v.upvotes.includes(me.id)"
          :aria-label="t('poll.voteFor', { name: v.name })"
          @click="act(() => save({ venueIds: toggle(mine?.venueIds ?? [], v.id) }))"
        />
      </div>
    </div>

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
