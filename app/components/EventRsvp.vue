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

const open = computed(() => props.data.event.stage === 'rsvp');
const byId = (ids: number[]) => ids.map((id) => props.data.responses.find((r) => r.memberId === id)!);
const lists = computed(() => [
  { key: 'going', items: byId(props.data.confirmed), color: 'success' as const },
  { key: 'waitlist', items: byId(props.data.waitlist), color: 'warning' as const },
  { key: 'maybe', items: props.data.responses.filter((r) => r.status === 'maybe'), color: 'neutral' as const },
  { key: 'no', items: props.data.responses.filter((r) => r.status === 'no'), color: 'neutral' as const },
]);
const myPlace = computed(() => {
  const i = props.data.waitlist.indexOf(props.me?.id ?? -1);
  return i < 0 ? null : i + 1;
});

const OPTIONS = [
  { value: 'going', icon: 'i-lucide-circle-check', color: 'success' },
  { value: 'maybe', icon: 'i-lucide-circle-help', color: 'warning' },
  { value: 'no', icon: 'i-lucide-circle-x', color: 'neutral' },
] as const;

const AVATAR_TONE = {
  success: { root: 'bg-success', fallback: 'text-white font-semibold' },
  warning: { root: 'bg-warning', fallback: 'text-white font-semibold' },
  neutral: { root: 'bg-accented', fallback: 'font-semibold' },
};

async function answer(status: 'going' | 'maybe' | 'no') {
  if (!props.me) return;
  const ok = await call('/response', 'PUT', {
    memberId: props.me.id,
    status,
    guests: status === 'going' ? guests.value : 0,
  });
  if (ok) {
    if (status === 'going' && mine.value?.status !== 'going') confetti();
    emit('changed');
  }
}
</script>

<template>
  <UCard v-if="data.event.stage !== 'poll'" id="rsvp" class="scroll-mt-4">
    <template #header>
      <div class="flex items-center justify-between">
        <span>{{ t('rsvp.title') }}</span>
        <span class="text-sm text-muted">{{ data.responses.filter((r) => r.status).length }} {{ t('rsvp.replies') }}</span>
      </div>
    </template>

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

    <div class="mt-4 space-y-4">
      <div v-for="l in lists.filter((x) => x.items.length)" :key="l.key">
        <p class="mb-2 text-sm font-semibold text-muted">{{ t(`rsvp.list.${l.key}`) }} · {{ l.items.length }}</p>
        <div class="flex flex-wrap gap-2">
          <span v-for="r in l.items" :key="r.memberId" class="inline-flex items-center gap-1.5 rounded-full bg-elevated py-1 pr-3 pl-1 text-sm">
            <UAvatar :alt="r.name" size="2xs" :ui="AVATAR_TONE[l.color]" />
            {{ r.name }}<span v-if="r.guests" class="text-muted">+{{ r.guests }}</span>
          </span>
        </div>
      </div>
    </div>
  </UCard>
</template>
