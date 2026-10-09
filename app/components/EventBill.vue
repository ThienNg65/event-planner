<script setup lang="ts">
const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const ev = computed(() => props.data.event);
// Only confirmed attendees pay: share × (1 + guests).
const payers = computed(() =>
  props.data.confirmed.map((id) => {
    const r = props.data.responses.find((x) => x.memberId === id)!;
    return { ...r, owes: (props.data.share ?? 0) * (1 + r.guests) };
  })
);
const mine = computed(() => payers.value.find((p) => p.memberId === props.me?.id));
const paidTotal = computed(() => payers.value.filter((p) => p.paidAt).reduce((s, p) => s + p.owes, 0));
const qr = computed(() =>
  mine.value && ev.value.bankId && ev.value.bankAccount
    ? vietqrUrl(ev.value.bankId, ev.value.bankAccount, ev.value.bankHolder, mine.value.owes, `${ev.value.title} ${mine.value.name}`)
    : null
);

async function setPaid(memberId: number, paid: boolean) {
  if (await call('/response', 'PUT', { memberId, paid })) {
    if (paid && memberId === props.me?.id) confetti();
    emit('changed');
  }
}
</script>

<template>
  <UCard v-if="ev.stage === 'bill' || ev.stage === 'settled'" id="bill" class="scroll-mt-4">
    <template #header>{{ t('bill.title') }}</template>

    <p v-if="data.share === null" class="text-sm text-muted">{{ t('bill.pending') }}</p>
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-3 text-center">
        <div class="rounded-xl bg-elevated p-3">
          <p class="text-xs text-muted uppercase">{{ t('bill.total') }}</p>
          <p class="text-lg font-semibold">{{ fmtVnd(ev.billTotal!) }}</p>
        </div>
        <div class="rounded-xl bg-elevated p-3">
          <p class="text-xs text-muted uppercase">{{ t('bill.perSeat') }}</p>
          <p class="text-lg font-semibold">{{ fmtVnd(data.share) }}</p>
          <p class="text-xs text-muted">{{ t('bill.rounded', { n: data.seats }) }}</p>
        </div>
      </div>

      <div v-if="mine" class="space-y-4 rounded-2xl bg-elevated p-5 text-center">
        <div>
          <p class="text-sm text-muted">{{ t('bill.youOwe') }}</p>
          <p class="text-4xl font-bold tracking-tight text-highlighted tabular-nums">{{ fmtVnd(mine.owes) }}</p>
          <p v-if="mine.guests" class="text-sm text-muted">{{ t('bill.withGuests', { n: mine.guests }, mine.guests) }}</p>
        </div>
        <img v-if="qr && !mine.paidAt" :src="qr" :alt="t('bill.qrAlt')" class="mx-auto w-64 max-w-full rounded-xl bg-white shadow-sm" />
        <p v-else-if="!ev.bankAccount" class="text-sm text-muted">{{ t('bill.noBank') }}</p>
        <UButton
          :loading="busy"
          :color="mine.paidAt ? 'secondary' : 'primary'"
          :variant="mine.paidAt ? 'soft' : 'solid'"
          :icon="mine.paidAt ? 'i-lucide-check' : undefined"
          @click="setPaid(mine.memberId, !mine.paidAt)"
        >
          {{ mine.paidAt ? t('bill.paid') : t('bill.markPaid') }}
        </UButton>
      </div>

      <div>
        <p class="mb-2 text-sm font-semibold">{{ t('bill.collected', { paid: fmtVnd(paidTotal), total: fmtVnd(payers.reduce((s, p) => s + p.owes, 0)) }) }}</p>
        <ul class="divide-y divide-default">
          <li v-for="p in payers" :key="p.memberId" class="flex items-center justify-between gap-2 py-2">
            <span class="min-w-0 truncate">{{ p.name }}<span v-if="p.guests" class="text-muted"> +{{ p.guests }}</span></span>
            <span class="flex shrink-0 items-center gap-2">
              <span class="text-sm">{{ fmtVnd(p.owes) }}</span>
              <UButton
                v-if="data.manager"
                size="xs"
                :loading="busy"
                :color="p.paidAt ? 'success' : 'neutral'"
                :variant="p.paidAt ? 'soft' : 'outline'"
                :label="p.paidAt ? t('bill.paid') : t('bill.unpaid')"
                @click="setPaid(p.memberId, !p.paidAt)"
              />
              <UBadge v-else :color="p.paidAt ? 'success' : 'neutral'" variant="subtle" :label="p.paidAt ? t('bill.paid') : t('bill.unpaid')" />
            </span>
          </li>
        </ul>
      </div>
    </div>
  </UCard>
</template>
