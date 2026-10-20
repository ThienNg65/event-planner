<script setup lang="ts">
const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const ev = computed(() => props.data.event);
// Only confirmed attendees pay: a share per seat, or a sponsor's fixed amount plus a share per guest.
const payers = computed(() =>
  props.data.confirmed.map((id) => {
    const r = props.data.responses.find((x) => x.memberId === id)!;
    const owes = owesOf(r, props.data.share ?? 0);
    return { ...r, owes, ...paymentOf(r, owes) };
  })
);
const sponsors = computed(() => payers.value.filter((p) => p.sponsorAmount));
const plainSeats = computed(() => payers.value.reduce((n, p) => n + (p.sponsorAmount ? 0 : 1) + p.guests, 0));
const mine = computed(() => payers.value.find((p) => p.memberId === props.me?.id));
const collected = computed(() => payers.value.reduce((s, p) => s + Math.min(p.paid, p.owes), 0));
const total = computed(() => payers.value.reduce((s, p) => s + p.owes, 0));
const stillOwe = computed(() => payers.value.filter((p) => !p.done).length);
// After Completed, someone who still owes can report a payment; everyone else is done.
const locked = computed(() => !!ev.value.cancelledAt || (ev.value.stage === 'settled' && (!mine.value || mine.value.done)));

const qrFailed = ref(false);
const qr = computed(() =>
  mine.value && !mine.value.done && ev.value.bankId && ev.value.bankAccount
    ? vietqrUrl(ev.value.bankId, ev.value.bankAccount, ev.value.bankHolder, mine.value.left, `${ev.value.title} ${mine.value.name}`)
    : null
);
watch(qr, () => (qrFailed.value = false));

// "I paid…" starts at what is still left, so one tap confirms the usual full payment.
const amount = ref(0);
watch(() => mine.value?.left, (l) => (amount.value = l ?? 0), { immediate: true });

async function setPaid(body: { paidAmount: null } | { addPaid: number }) {
  const ok = await call('/response', 'PUT', { memberId: props.me!.id, ...body });
  if (ok && 'addPaid' in body && mine.value!.paid + body.addPaid >= mine.value!.owes) confetti();
  emit('changed');
}
</script>

<template>
  <section id="bill" class="scroll-mt-4 space-y-4">
    <h2 class="text-lg font-semibold text-highlighted">{{ t('bill.title') }}</h2>

    <p v-if="data.share === null" class="text-sm text-muted">{{ t(ev.stage === 'settled' ? 'bill.none' : 'bill.pending') }}</p>
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-3 text-center">
        <div class="rounded-xl bg-elevated p-3">
          <p class="text-xs text-muted uppercase">{{ t('bill.total') }}</p>
          <p class="text-lg font-semibold">{{ fmtVnd(ev.billTotal!) }}</p>
        </div>
        <div class="rounded-xl bg-elevated p-3">
          <p class="text-xs text-muted uppercase">{{ t('bill.perSeat') }}</p>
          <p class="text-lg font-semibold">{{ fmtVnd(data.share) }}</p>
          <p class="text-xs text-muted">{{ t('bill.rounded', { n: plainSeats }) }}</p>
        </div>
      </div>
      <p v-if="sponsors.length" class="text-center text-sm text-muted">
        {{ t('bill.sponsors', { list: sponsors.map((p) => `${p.name} ${fmtVnd(p.sponsorAmount!)}`).join(', ') }) }}
      </p>

      <div v-if="mine" class="space-y-4 rounded-2xl bg-elevated p-5 text-center">
        <div>
          <p class="text-sm text-muted">{{ t('bill.share') }}</p>
          <p class="text-4xl font-bold tracking-tight text-highlighted tabular-nums">{{ fmtVnd(mine.owes) }}</p>
          <p v-if="mine.guests" class="text-sm text-muted">{{ t('bill.withGuests', { n: mine.guests }, mine.guests) }}</p>
          <p v-if="mine.paid > 0" class="mt-1 text-sm text-muted tabular-nums">
            {{ t('bill.paidSoFar', { amount: fmtVnd(mine.paid) }) }}<template v-if="!mine.done"> · <span class="font-semibold text-highlighted">{{ t('bill.left', { amount: fmtVnd(mine.left) }) }}</span></template>
          </p>
        </div>

        <template v-if="mine.done">
          <p class="flex items-center justify-center gap-1.5 font-semibold text-success"><UIcon name="i-lucide-badge-check" class="size-5" />{{ t('bill.paidFull') }}</p>
          <UButton v-if="!locked && ev.stage === 'bill'" size="sm" color="neutral" variant="ghost" :loading="busy" @click="setPaid({ paidAmount: null })">{{ t('bill.clear') }}</UButton>
        </template>
        <template v-else-if="!locked">
          <img v-if="qr && !qrFailed" :src="qr" :alt="t('bill.qrAlt')" class="mx-auto w-64 max-w-full rounded-xl bg-white shadow-sm" @error="qrFailed = true" />
          <p v-else-if="ev.bankAccount" class="text-sm text-muted">
            {{ t('bill.bankFallback', { bank: [ev.bankId, ev.bankAccount, ev.bankHolder].filter(Boolean).join(' · ') }) }}
          </p>
          <p v-else class="text-sm text-muted">{{ t('bill.noBank') }}</p>
          <div class="mx-auto flex max-w-xs flex-col gap-2 text-left">
            <UFormField :label="t('bill.amountLabel')">
              <UInputNumber v-model="amount" :min="1" :step="1000" :format-options="{ maximumFractionDigits: 0 }" class="w-full" />
            </UFormField>
            <UButton block :loading="busy" :disabled="!amount || amount < 1" @click="setPaid({ addPaid: amount })">{{ t('bill.confirm') }}</UButton>
          </div>
        </template>
      </div>
      <p v-if="locked" class="text-sm text-muted">{{ t('bill.locked') }}</p>

      <p class="text-sm font-semibold tabular-nums">{{ t('bill.ledger', { paid: fmtVnd(collected), total: fmtVnd(total), n: stillOwe }) }}</p>
    </div>
  </section>
</template>
