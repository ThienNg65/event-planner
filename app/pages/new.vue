<script setup lang="ts">
const { t } = useI18n();
const toast = useToast();
const { me, members } = useMe();
const join = useJoin();
const route = useRoute();
// Set when the page was opened from "Duplicate": the title of the event being copied.
const copiedFrom = ref('');
// Tells the event page to open its share dialog once.
const justCreated = useState<number>('justCreated', () => 0);

const BANK = 'te:bank';
const form = reactive({
  title: '',
  note: '',
  dateMode: 'poll' as 'fixed' | 'poll',
  startsAt: '',
  pollDays: [] as string[],
  venueMode: 'fixed' as 'fixed' | 'poll',
  venue: '',
  venueLink: '',
  capacity: null as number | null,
  maxGuests: MAX_GUESTS as number,
  hideVotes: false,
  repeat: 'none',
  repeatUntil: '',
  honorees: [] as number[],
  bankId: '',
  bankAccount: '',
  bankHolder: '',
  cover: null as string | null,
  theme: useAppTheme().value as string,
});
usePlaceName(
  () => form.venueLink,
  (name) => {
    if (!form.venue.trim()) form.venue = name;
  }
);
// The whole page previews the picked theme.
useEventTheme(() => form.theme);
const busy = ref(false);
// The seat limit is a switch; its number only shows (and counts) while it is on.
const limited = ref(false);
watch(limited, (on) => {
  if (!on) form.capacity = null;
});
// The first thing still missing, shown next to the disabled Create button so it never looks broken.
const missing = computed(() => {
  if (!form.title.trim()) return 'create.needTitle';
  if (form.dateMode === 'poll' && !form.pollDays.length) return 'create.needDays';
  if (form.dateMode === 'fixed' && !form.startsAt) return 'create.needDate';
  return null;
});

// Repeating needs a fixed date and a place (no polls); picking a poll switches it off.
const canRepeat = computed(() => form.dateMode === 'fixed' && form.venueMode === 'fixed' && !!form.venue.trim());
const repeating = computed(() => canRepeat.value && form.repeat !== 'none');

// The optional settings: each is one line until tapped.
// Each row says what is set, so nothing needs opening just to check.
const rows = computed(() => [
  { label: t('create.where'), value: form.venueMode === 'poll' ? t('create.pollVenue') : form.venue.trim(), icon: 'i-lucide-map-pin', slot: 'where' },
  { label: t('create.note'), value: form.note.trim(), icon: 'i-lucide-notebook-pen', slot: 'note' },
  { label: t('theme.label'), value: t(`theme.${form.theme}`), icon: 'i-lucide-palette', slot: 'look' },
  { label: t('edit.honorees'), value: form.honorees.map((id) => members.value.find((m) => m.id === id)?.name).filter(Boolean).join(', '), icon: 'i-lucide-cake', slot: 'honorees' },
  { label: t('create.advanced'), value: form.hideVotes ? t('create.hideVotes') : '', icon: 'i-lucide-sliders-horizontal', slot: 'advanced' },
  // Repeating needs a fixed date and place, so the row waits for them.
  ...(canRepeat.value ? [{ label: t('create.repeat'), value: form.repeat === 'none' ? '' : t(`create.repeat${form.repeat.charAt(0).toUpperCase()}${form.repeat.slice(1)}`), icon: 'i-lucide-repeat', slot: 'repeat' }] : []),
  { label: t('create.payment'), value: form.bankHolder.trim(), icon: 'i-lucide-wallet', slot: 'payment' },
]);

// Quick starts: one tap fills a title (unless you typed your own) and a matching cover.
const TEMPLATES = [
  { key: 'birthday', cover: 'candy' },
  { key: 'lunch', cover: 'sunset' },
  { key: 'afterwork', cover: 'aurora' },
  { key: 'sports', cover: 'forest' },
  { key: 'trip', cover: 'ocean' },
] as const;
const templateTitles = computed(() => TEMPLATES.map((x) => t(`create.templates.${x.key}`)));
function applyTemplate(i: number) {
  const tpl = TEMPLATES[i]!;
  if (!form.title.trim() || templateTitles.value.includes(form.title)) form.title = templateTitles.value[i]!;
  form.cover = tpl.cover;
}

onMounted(async () => {
  try {
    Object.assign(form, JSON.parse(localStorage.getItem(BANK) ?? '{}'));
  } catch {
    /* nothing remembered */
  }
  const from = Number(route.query.from);
  if (Number.isInteger(from) && from > 0) await prefillFrom(from);
});

/** Copies what an organizer would retype from an earlier event: no dates, answers, keys or links. Bank details only from the creator's own events. */
async function prefillFrom(id: number) {
  try {
    const key = manageKeyOf(id);
    const { event: e } = await $fetch(`/api/events/${id}`, { headers: key ? { 'x-manage-key': key } : {} });
    Object.assign(form, {
      title: e.title,
      note: e.note,
      venueMode: e.venue ? 'fixed' : 'poll',
      venue: e.venue ?? '',
      venueLink: e.venueLink ?? '',
      // The limit the event was planned with, not one the attendance check raised.
      capacity: e.plannedCapacity ?? e.capacity,
      maxGuests: guestLimit(e),
      hideVotes: e.hideVotes,
      honorees: [...e.honorees],
      cover: e.cover,
      theme: themeOf(e.theme),
      ...(me.value?.id === e.createdBy && { bankId: e.bankId ?? '', bankAccount: e.bankAccount ?? '', bankHolder: e.bankHolder ?? '' }),
    });
    limited.value = !!form.capacity;
    copiedFrom.value = e.title;
  } catch (err) {
    toast.add({ color: 'error', title: errMsg(err) });
  }
}

// Not signed in yet: the join sheet asks for a name and PIN, then this carries on.
const submit = () => join.ask(create, { newOnly: true });

async function create() {
  busy.value = true;
  try {
    const poll = form.dateMode === 'poll';
    const fixedVenue = form.venueMode === 'fixed';
    const bank = { bankId: form.bankId, bankAccount: form.bankAccount, bankHolder: form.bankHolder };
    const res = await $fetch('/api/events', {
      method: 'POST',
      body: {
        title: form.title,
        note: form.note,
        pollDays: poll ? form.pollDays : [],
        startsAt: !poll && form.startsAt ? teamTime(...(form.startsAt.split('T') as [string, string])) : null,
        venue: fixedVenue ? form.venue : null,
        venueLink: fixedVenue ? form.venueLink : null,
        capacity: form.capacity || null,
        maxGuests: form.maxGuests,
        hideVotes: form.hideVotes,
        repeat: repeating.value ? form.repeat : null,
        repeatUntil: repeating.value && form.repeatUntil ? form.repeatUntil : null,
        honorees: form.honorees,
        cover: form.cover,
        theme: form.theme,
        ...bank,
      },
    });
    try {
      localStorage.setItem(BANK, JSON.stringify(bank));
    } catch {
      /* not remembered, that's fine */
    }
    saveManageKey(res.id, res.key);
    justCreated.value = res.id;
    toast.add({ color: 'success', title: t('create.done'), description: t('create.keyHint') });
    await navigateTo(`/e/${res.id}`);
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UDashboardPanel id="new">
    <template #header>
      <UDashboardNavbar :title="t('create.title')">
        <template #leading><UDashboardSidebarCollapse /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert v-if="copiedFrom" class="mx-auto w-full max-w-2xl" color="info" variant="subtle" icon="i-lucide-copy" :title="t('create.copiedFrom', { title: copiedFrom })" />

      <UForm id="create-form" :state="form" class="mx-auto w-full max-w-2xl space-y-6" @submit="submit">
        <UCard :ui="{ body: 'space-y-5' }">
          <div class="space-y-2">
            <UFormField :label="t('create.name')" required>
              <UInput v-model="form.title" :maxlength="100" :placeholder="t('create.namePlaceholder')" class="w-full" />
            </UFormField>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm text-muted">{{ t('create.quickStart') }}</span>
              <UButton v-for="(tpl, i) in TEMPLATES" :key="tpl.key" size="sm" color="neutral" variant="outline" class="rounded-md" :label="templateTitles[i]" @click="applyTemplate(i)" />
            </div>
          </div>

          <UFormField :label="t('create.when')">
            <UTabs
              v-model="form.dateMode"
              :content="false"
              size="sm"
              :items="[
                { label: t('create.pollDates'), value: 'poll', icon: 'i-lucide-vote' },
                { label: t('create.fixedDate'), value: 'fixed', icon: 'i-lucide-calendar' },
              ]"
              class="mb-3"
            />
            <DateTimeInput v-if="form.dateMode === 'fixed'" v-model="form.startsAt" class="w-full" />
            <PollDaysInput v-else v-model="form.pollDays" />
            <p v-if="form.dateMode === 'fixed' && (form.venueMode === 'poll' || !form.venue.trim())" class="mt-2 text-sm text-muted">{{ t('create.fixedDateNoVenue') }}</p>
          </UFormField>
        </UCard>

        <UCard :ui="{ body: 'space-y-3' }">
          <h2 class="text-sm font-semibold text-highlighted">{{ t('create.more') }}</h2>
          <div class="flex items-center justify-between gap-3">
            <USwitch v-model="limited" :label="t('create.capacity')" />
            <UInputNumber v-if="limited" v-model="form.capacity" :min="1" :max="500" :placeholder="t('create.unlimited')" :aria-label="t('create.capacity')" class="w-36" />
          </div>
          <UAccordion type="multiple" :items="rows">
            <template #default="{ item }">
              <span class="flex min-w-0 items-baseline gap-2">
                <span>{{ item.label }}</span>
                <span v-if="item.value" class="truncate text-sm font-normal text-muted">{{ item.value }}</span>
              </span>
            </template>
            <template #where-body>
              <UTabs
                v-model="form.venueMode"
                :content="false"
                size="sm"
                :items="[
                  { label: t('create.fixedVenue'), value: 'fixed', icon: 'i-lucide-map-pin' },
                  { label: t('create.pollVenue'), value: 'poll', icon: 'i-lucide-messages-square' },
                ]"
                class="mb-3"
              />
              <div v-if="form.venueMode === 'fixed'" class="space-y-2">
                <UInput v-model="form.venue" :maxlength="100" :placeholder="t('create.venue')" class="w-full" />
                <UInput v-model="form.venueLink" type="url" :placeholder="t('create.venueLink')" class="w-full" />
              </div>
              <p v-else class="text-sm text-muted">{{ t('create.pollVenueHint') }}</p>
            </template>
            <template #note-body>
              <UTextarea v-model="form.note" :maxlength="500" :rows="3" :aria-label="t('create.note')" class="w-full" />
            </template>
            <template #look-body>
              <div class="space-y-4">
                <UFormField :label="t('cover.label')"><CoverPicker v-model="form.cover" /></UFormField>
                <UFormField :label="t('theme.label')" :hint="t('theme.hint')"><ThemePicker v-model="form.theme" :title="form.title" :cover="form.cover" /></UFormField>
              </div>
            </template>
            <template #honorees-body>
              <UFormField :hint="t('edit.honoreesHint')">
                <USelectMenu v-model="form.honorees" :items="members" value-key="id" label-key="name" multiple :placeholder="t('edit.honoreesPick')" :aria-label="t('edit.honorees')" class="w-full" />
              </UFormField>
            </template>
            <template #advanced-body>
              <div class="space-y-4">
                <UFormField :label="t('create.maxGuests')" :hint="t('create.maxGuestsHint')">
                  <UInputNumber v-model="form.maxGuests" :min="0" :max="MAX_GUESTS" class="w-44" />
                </UFormField>
                <UCheckbox v-model="form.hideVotes" :label="t('create.hideVotes')" :description="t('create.hideVotesHint')" />
              </div>
            </template>
            <template #repeat-body>
              <RepeatFields v-model:repeat="form.repeat" v-model:until="form.repeatUntil" :disabled="!canRepeat" />
            </template>
            <template #payment-body>
              <UFormField :label="t('create.bank')" :description="t('create.paymentLater')" :help="t('create.bankPublic')">
                <div class="grid gap-2 sm:grid-cols-3">
                  <UInput v-model="form.bankId" :placeholder="t('create.bankId')" />
                  <UInput v-model="form.bankAccount" :placeholder="t('create.bankAccount')" inputmode="numeric" />
                  <UInput v-model="form.bankHolder" :placeholder="t('create.bankHolder')" />
                </div>
                <BankQrPreview :bank-id="form.bankId" :bank-account="form.bankAccount" :bank-holder="form.bankHolder" class="mt-2" />
              </UFormField>
            </template>
          </UAccordion>
        </UCard>
      </UForm>
    </template>

    <!-- In the panel footer: always in reach, never over the form. The button submits the form by id. -->
    <template #footer>
      <div class="border-t border-default px-4 py-3 sm:px-6">
        <div class="mx-auto flex w-full max-w-2xl items-center justify-end gap-3">
          <p v-if="missing" class="text-sm text-muted">{{ t(missing) }}</p>
          <UButton type="submit" form="create-form" size="lg" icon="i-lucide-sparkles" :loading="busy" :disabled="!!missing">
            {{ t('create.submit') }}
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
