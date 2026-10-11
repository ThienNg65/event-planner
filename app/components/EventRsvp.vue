<script setup lang="ts">
const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const mine = computed(() => props.data.responses.find((r) => r.memberId === props.me?.id));
const guests = ref(0);
watch(mine, (r) => (guests.value = r?.guests ?? 0), { immediate: true });

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

async function answer(status: 'going' | 'maybe' | 'no') {
  if (!props.me) return;
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

    <div v-if="open && me" class="space-y-3">
      <div class="grid grid-cols-3 gap-2">
        <UButton
          v-for="o in OPTIONS"
          :key="o.value"
          size="lg"
          block
          :icon="o.icon"
          :color="mine?.status === o.value ? o.color : 'neutral'"
          :variant="mine?.status === o.value ? 'solid' : 'outline'"
          :aria-pressed="mine?.status === o.value"
          :disabled="busy"
          :label="t(`rsvp.${o.value}`)"
          @click="answer(o.value)"
        />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm">{{ t('rsvp.guests') }}</span>
        <UInputNumber v-model="guests" :min="0" :max="10" class="w-32" />
      </div>
      <template v-if="mine">
        <div v-if="mine?.status === 'going' && guests !== mine.guests" class="flex items-center gap-3">
          <p class="flex-1 text-xs text-muted">{{ t('rsvp.guestsHint') }}</p>
          <UButton size="sm" :loading="busy" @click="answer('going')">{{ t('rsvp.update') }}</UButton>
        </div>
        <UAlert v-if="myPlace" color="warning" variant="subtle" :title="t('rsvp.onWaitlist', { n: myPlace })" />
      </template>
    </div>
  </section>
</template>
