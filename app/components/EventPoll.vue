<script setup lang="ts">
const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const { busy, call } = useEventApi(
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

const days = computed(() => {
  const rows = ev.value.pollDays.map((d) => ({ day: d, ...dayParts(d, locale.value), names: voters((r) => r.days.includes(d)) }));
  const best = Math.max(0, ...rows.map((r) => r.names.length));
  return rows.map((r) => ({ ...r, top: best > 0 && r.names.length === best }));
});

async function save(body: object) {
  if (!props.me) return;
  const first = !mine.value?.days.length && !mine.value?.venueIds.length;
  if (await call('/response', 'PUT', { memberId: props.me.id, ...body })) {
    if (first) confetti();
    emit('changed');
  }
}

const form = reactive({ name: '', link: '', note: '' });
async function suggest() {
  if (!props.me) return;
  if (await call('/venues', 'POST', { ...form, addedBy: props.me.id })) {
    Object.assign(form, { name: '', link: '', note: '' });
    emit('changed');
  }
}
</script>

<template>
  <div v-if="ev.stage === 'poll'" id="poll" class="scroll-mt-4 space-y-6">
    <UCard v-if="ev.pollDays.length">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <span>{{ t('poll.days') }}</span>
          <span class="text-sm font-normal text-muted">{{ t('poll.tapHint') }}</span>
        </div>
      </template>
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
        <button
          v-for="d in days"
          :key="d.day"
          type="button"
          :aria-pressed="myDays.includes(d.day)"
          :disabled="!me || busy"
          :title="d.names.join(', ')"
          class="relative flex flex-col items-center gap-0.5 rounded-xl p-3 text-center ring transition focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
          :class="[
            myDays.includes(d.day) ? 'bg-primary/10 ring-2 ring-primary' : 'ring-default enabled:hover:bg-elevated',
            d.top && !myDays.includes(d.day) && 'ring-secondary',
          ]"
          @click="save({ days: toggle(myDays, d.day) })"
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
    </UCard>

    <UCard v-if="!ev.venue">
      <template #header>{{ t('poll.venues') }}</template>
      <div class="space-y-2">
        <p v-if="!data.venues.length" class="text-sm text-muted">{{ t('poll.noVenues') }}</p>
        <div v-for="v in data.venues" :key="v.id" class="flex items-center gap-3 rounded-md bg-elevated p-3">
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">
              <ULink v-if="v.link" :to="v.link" target="_blank" rel="noopener noreferrer">{{ v.name }}</ULink>
              <template v-else>{{ v.name }}</template>
            </p>
            <p v-if="v.note" class="text-sm text-muted">{{ v.note }}</p>
            <p class="text-xs text-dimmed">{{ t('poll.suggestedBy', { name: v.addedByName }) }}</p>
          </div>
          <UButton
            :disabled="!me || busy"
            :variant="me && v.upvotes.includes(me.id) ? 'solid' : 'outline'"
            icon="i-lucide-thumbs-up"
            :label="String(v.upvotes.length)"
            :aria-pressed="!!me && v.upvotes.includes(me.id)"
            @click="save({ venueIds: toggle(mine?.venueIds ?? [], v.id) })"
          />
        </div>

        <form class="space-y-2 pt-3" @submit.prevent="suggest">
          <p class="text-sm font-semibold">{{ t('poll.suggest') }}</p>
          <UInput v-model="form.name" :maxlength="100" :placeholder="t('create.venue')" required class="w-full" />
          <UInput v-model="form.link" type="url" :placeholder="t('create.venueLink')" class="w-full" />
          <UInput v-model="form.note" :maxlength="300" :placeholder="t('create.note')" class="w-full" />
          <UButton type="submit" variant="soft" :loading="busy" :disabled="!me || !form.name.trim()">{{ t('poll.add') }}</UButton>
        </form>
      </div>
    </UCard>
  </div>
</template>
