<script setup lang="ts">
const props = defineProps<{ data: EventDetail; me: Member | null; manageKey: string | null; role: Role }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const ev = computed(() => props.data.event);
type Row = EventDetail['responses'][number];
const COLLAPSED = 8;
const showAll = ref(false);
const canSet = computed(() => can(props.role, 'setOthers') && !ev.value.cancelledAt);
const paying = computed(() => ev.value.stage === 'bill' || ev.value.stage === 'settled');

// One list for everyone: who is in, with their answer and (when paying) how much they have settled.
const ORDER = ['going', 'waitlist', 'maybe', 'no', 'voted'] as const;
const rows = computed(() =>
  props.data.responses
    .filter((r) => (ev.value.stage === 'poll' ? r.days.length || r.venueIds.length || r.status === 'no' : r.status))
    .map((r) => {
      const waitPlace = props.data.waitlist.indexOf(r.memberId) + 1;
      // While polling, "can't join" is the only answer that counts (it withdraws the votes).
      const declined = ev.value.stage === 'poll' && r.status === 'no' && !r.days.length && !r.venueIds.length;
      const answered = ev.value.stage !== 'poll' || declined;
      // A held seat past its deadline is released: that person is back to "voted, no answer".
      const lost = r.derived === 'reconfirm' && !props.data.held.includes(r.memberId);
      const kind = !answered || lost ? 'voted' : props.data.confirmed.includes(r.memberId) ? 'going' : waitPlace ? 'waitlist' : (r.status ?? 'voted');
      // No share yet (bill not entered): nothing is owed, so no payment state to show.
      const owes = kind === 'going' && props.data.share !== null ? props.data.share * (1 + r.guests) : null;
      return { r, kind: kind as (typeof ORDER)[number], waitPlace, owes, pay: owes === null ? null : paymentOf(r, owes) };
    })
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.r.name.localeCompare(b.r.name))
);
const shown = computed(() => (showAll.value ? rows.value : rows.value.slice(0, COLLAPSED)));

const KIND_COLOR = { going: 'success', waitlist: 'warning', maybe: 'neutral', no: 'neutral', voted: 'neutral' } as const;
const heldUntil = computed(() => (ev.value.reconfirmBy ? fmtDateTime(ev.value.reconfirmBy, locale.value) : ''));
const label = (kind: (typeof ORDER)[number], place: number) => (kind === 'waitlist' ? t('people.waitlist', { n: place }) : t(`people.${kind}`));

async function put(memberId: number, body: object) {
  if (await call('/response', 'PUT', { memberId, ...body })) emit('changed');
}

function menu(row: (typeof rows.value)[number]) {
  const items = [];
  if (ev.value.stage === 'rsvp') {
    for (const s of ['going', 'maybe', 'no'] as const) {
      items.push({ label: t(`rsvp.${s}`), onSelect: () => put(row.r.memberId, { status: s, guests: s === 'going' ? row.r.guests : 0 }) });
    }
  }
  if (paying.value && row.pay) {
    items.push(
      { label: t('people.markPaid'), icon: 'i-lucide-badge-check', onSelect: () => put(row.r.memberId, { paid: true }) },
      { label: t('people.setAmount'), icon: 'i-lucide-pencil', onSelect: () => openAmount(row.r) },
      { label: t('people.markUnpaid'), icon: 'i-lucide-circle-slash', onSelect: () => put(row.r.memberId, { paidAmount: null }) }
    );
  }
  return items;
}

const amountFor = ref<Row | null>(null);
const amountValue = ref(0);
const amountOpen = computed({ get: () => !!amountFor.value, set: (o) => !o && (amountFor.value = null) });
function openAmount(r: Row) {
  amountValue.value = r.paidAmount ?? 0;
  amountFor.value = r;
}
async function saveAmount() {
  if (amountFor.value) await put(amountFor.value.memberId, { paidAmount: amountValue.value || null });
  amountFor.value = null;
}
</script>

<template>
  <section class="space-y-3 border-t border-default pt-6">
    <h2 class="text-lg font-semibold text-highlighted">{{ t('people.title') }}</h2>
    <p v-if="!rows.length" class="text-sm text-muted">{{ t('people.empty') }}</p>
    <ul v-else class="divide-y divide-default">
      <li v-for="row in shown" :key="row.r.memberId" class="flex items-center gap-3 py-2">
        <UAvatar :alt="row.r.name" size="sm" />
        <span class="min-w-0 flex-1 truncate">
          {{ row.r.name }}<span v-if="row.r.guests && (row.kind === 'going' || row.kind === 'waitlist')" class="text-muted"> +{{ row.r.guests }}</span>
        </span>
        <UBadge v-if="row.r.derived === 'going'" color="neutral" variant="outline" size="sm" :label="t('people.fromVote')" />
        <UBadge v-else-if="row.r.derived === 'reconfirm' && row.kind !== 'voted'" color="warning" variant="outline" size="sm" :label="t('people.heldUntil', { time: heldUntil })" />
        <template v-if="ev.stage === 'poll' && row.kind !== 'no'">
          <UBadge v-if="row.r.days.length" color="neutral" variant="subtle" icon="i-lucide-calendar-days" :label="t('people.days', row.r.days.length)" />
          <UBadge
            v-if="row.r.venueIds.length"
            color="neutral"
            variant="subtle"
            icon="i-lucide-map-pin"
            :label="t('people.places', row.r.venueIds.length)"
            :title="data.venues.filter((v) => row.r.venueIds.includes(v.id)).map((v) => v.name).join(', ')"
          />
        </template>
        <UBadge v-else :color="KIND_COLOR[row.kind]" variant="subtle" :label="label(row.kind, row.waitPlace)" />
        <UBadge
          v-if="paying && row.pay"
          :color="row.pay.done ? 'success' : row.pay.paid > 0 ? 'warning' : 'neutral'"
          variant="subtle"
          :label="row.pay.done ? t('people.paid') : row.pay.paid > 0 ? t('people.left', { amount: fmtVnd(row.pay.left) }) : t('people.unpaid')"
        />
        <UDropdownMenu v-if="canSet && menu(row).length" :items="menu(row)">
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" :loading="busy" :aria-label="t('people.actions', { name: row.r.name })" />
        </UDropdownMenu>
      </li>
    </ul>
    <UButton v-if="rows.length > COLLAPSED" color="neutral" variant="link" size="sm" @click="showAll = !showAll">
      {{ showAll ? t('people.showLess') : t('people.showAll', { n: rows.length }) }}
    </UButton>

    <UModal v-model:open="amountOpen" :title="t('people.setAmount')" :description="amountFor?.name">
      <template #body>
        <UFormField :label="t('people.amount')">
          <UInputNumber v-model="amountValue" :min="0" :step="1000" :format-options="{ maximumFractionDigits: 0 }" class="w-48" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="amountFor = null">{{ t('cancel') }}</UButton>
          <UButton :loading="busy" @click="saveAmount">{{ t('people.save') }}</UButton>
        </div>
      </template>
    </UModal>
  </section>
</template>
