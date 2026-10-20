<script setup lang="ts">
const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const mine = computed(() => props.data.responses.find((r) => r.memberId === props.me?.id));
// A held seat is not the member's own answer yet, so no button shows as chosen.
const shown = computed(() => (mine.value?.derived === 'reconfirm' ? null : (mine.value?.status ?? null)));
const held = computed(() => props.data.held.includes(props.me?.id ?? -1));
const heldUntil = computed(() => (props.data.event.reconfirmBy ? fmtDateTime(props.data.event.reconfirmBy, locale.value) : ''));
const limit = computed(() => guestLimit(props.data.event));
// Your own seats (you plus your guests) once you have one, marked on the seat holes.
const mySeats = computed(() => (props.me && props.data.confirmed.includes(props.me.id) ? 1 + (mine.value?.guests ?? 0) : 0));
const guests = ref(0);
// Guests save on their own, like the answer buttons; the pause sends a few taps on +/- as one write.
// While a save is pending, the server's copy doesn't overwrite what is being typed.
let guestTimer: ReturnType<typeof setTimeout> | undefined;
watch(mine, (r) => !guestTimer && (guests.value = r?.guests ?? 0), { immediate: true });
watch(guests, (n) => {
  clearTimeout(guestTimer);
  guestTimer = undefined;
  if (mine.value?.status === 'going' && n !== mine.value.guests) guestTimer = setTimeout(() => answer('going'), 600);
});

const open = computed(() => props.data.event.stage === 'rsvp' && !props.data.event.cancelledAt);
const myPlace = computed(() => {
  const i = props.data.waitlist.indexOf(props.me?.id ?? -1);
  return i < 0 ? null : i + 1;
});

const OPTIONS = [
  { value: 'going', icon: 'i-lucide-circle-check', color: 'success' },
  { value: 'maybe', icon: 'i-lucide-circle-help', color: 'warning' },
  { value: 'no', icon: 'i-lucide-circle-x', color: 'neutral' },
] as const;

const join = useJoin();
// A visitor is asked for a name first, then the tapped answer is sent.
function tap(status: 'going' | 'maybe' | 'no') {
  join.ask(() => answer(status));
}

async function answer(status: 'going' | 'maybe' | 'no') {
  if (!props.me) return;
  // A tapped answer replaces a guest save still waiting to go out.
  clearTimeout(guestTimer);
  guestTimer = undefined;
  const ok = await call('/response', 'PUT', {
    memberId: props.me.id,
    status,
    guests: status === 'going' ? guests.value : 0,
  });
  if (ok && status === 'going' && mine.value?.status !== 'going') confetti();
  emit('changed');
}
</script>

<template>
  <section id="rsvp" class="scroll-mt-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-highlighted">{{ t('rsvp.title') }}</h2>
      <span class="text-sm text-muted">{{ data.responses.filter((r) => r.status).length }} {{ t('rsvp.replies') }}</span>
    </div>
    <div v-if="data.event.capacity" class="flex items-center gap-3">
      <SeatHoles class="min-w-0 flex-1" :seats="data.seats" :capacity="data.event.capacity" :planned-capacity="data.event.plannedCapacity" :mine="mySeats" />
      <span class="shrink-0 text-sm text-muted tabular-nums">
        <SeatCount :seats="data.seats" :capacity="data.event.capacity" :planned-capacity="data.event.plannedCapacity" /> {{ t('event.seats') }}
      </span>
    </div>

    <div v-if="open" class="space-y-3">
      <UAlert v-if="mine?.derived === 'going'" color="success" variant="subtle" icon="i-lucide-vote" :title="t('rsvp.fromVote')" />
      <UAlert v-else-if="mine?.derived === 'reconfirm' && held" color="warning" variant="subtle" icon="i-lucide-calendar-clock" :title="t('rsvp.held', { deadline: heldUntil })" />
      <UAlert v-else-if="mine?.derived === 'reconfirm'" color="warning" variant="subtle" icon="i-lucide-calendar-x" :title="t('rsvp.released')" />
      <div class="grid grid-cols-3 gap-2">
        <UButton
          v-for="o in OPTIONS"
          :key="o.value"
          size="lg"
          block
          :icon="o.icon"
          :color="shown === o.value ? o.color : 'neutral'"
          :variant="shown === o.value ? 'solid' : 'outline'"
          :aria-pressed="shown === o.value"
          :disabled="busy"
          :label="t(`rsvp.${o.value}`)"
          @click="tap(o.value)"
        />
      </div>
      <div v-if="me" class="flex items-center justify-between gap-3">
        <span class="text-sm">{{ t('rsvp.guests') }}</span>
        <UInputNumber v-model="guests" :min="0" :max="limit" class="w-32" />
      </div>
      <p v-if="me && limit < MAX_GUESTS" class="text-xs text-muted">{{ t('rsvp.guestsMax', { n: limit }) }}</p>
      <p v-if="data.event.capacity && mine?.derived === 'going'" class="text-xs text-muted">{{ t('rsvp.guestsQueue') }}</p>
      <template v-if="mine">
        <p v-if="mine.status === 'going' && !mine.derived && data.event.capacity" class="text-xs text-muted">{{ t('rsvp.guestsHint') }}</p>
        <UAlert v-if="myPlace" color="warning" variant="subtle" :title="t('rsvp.onWaitlist', { n: myPlace })" />
      </template>
    </div>
  </section>
</template>
