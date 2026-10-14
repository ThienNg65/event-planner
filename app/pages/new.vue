<script setup lang="ts">
const { t } = useI18n();
const toast = useToast();
const { meId } = useMe();
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
// The first thing still missing, shown next to the disabled Create button so it never looks broken.
const missing = computed(() => {
  if (!meId.value) return 'create.pickFirst';
  if (!form.title.trim()) return 'create.needTitle';
  if (form.dateMode === 'poll' && !form.pollDays.length) return 'create.needDays';
  if (form.dateMode === 'fixed' && !form.startsAt) return 'create.needDate';
  return null;
});

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

onMounted(() => {
  try {
    Object.assign(form, JSON.parse(localStorage.getItem(BANK) ?? '{}'));
  } catch {
    /* nothing remembered */
  }
});

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
      <!-- MemberPicker has its own <form>, so it stays outside the create form. -->
      <UCard v-if="!meId" class="mx-auto w-full max-w-5xl shrink-0" :ui="{ root: 'ring-2 ring-primary/40', body: 'space-y-3' }">
        <p class="font-semibold text-highlighted">{{ t('create.whoTitle') }}</p>
        <MemberPicker new-only />
      </UCard>

      <div class="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
        <span class="text-sm text-muted">{{ t('create.quickStart') }}</span>
        <UButton
          v-for="(tpl, i) in TEMPLATES"
          :key="tpl.key"
          size="sm"
          color="neutral"
          variant="outline"
          class="rounded-md"
          :label="templateTitles[i]"
          @click="applyTemplate(i)"
        />
      </div>

      <UForm id="create-form" :state="form" class="mx-auto w-full max-w-5xl space-y-6" @submit="create">
        <div class="grid items-start gap-6 lg:grid-cols-2">
          <div class="space-y-6">
            <UCard :ui="{ body: 'space-y-4' }">
              <UFormField :label="t('create.name')" required>
                <UInput v-model="form.title" :maxlength="100" :placeholder="t('create.namePlaceholder')" class="w-full" />
              </UFormField>
              <UFormField :label="t('create.note')">
                <UTextarea v-model="form.note" :maxlength="500" :rows="3" class="w-full" />
              </UFormField>
              <UFormField :label="t('cover.label')">
                <CoverPicker v-model="form.cover" />
              </UFormField>
              <UFormField :label="t('theme.label')" :hint="t('theme.hint')">
                <ThemePicker v-model="form.theme" :title="form.title" :cover="form.cover" />
              </UFormField>
            </UCard>
          </div>

          <div class="space-y-6">
            <UCard :ui="{ body: 'space-y-5' }">
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

              <UFormField :label="t('create.where')">
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
              </UFormField>
            </UCard>

            <UCard :ui="{ body: 'space-y-5' }">
              <UFormField :label="t('create.capacity')" :hint="t('create.capacityHint')">
                <UInputNumber v-model="form.capacity" :min="1" :max="500" :placeholder="t('create.unlimited')" class="w-44" />
              </UFormField>

              <UCollapsible class="space-y-3">
                <UButton color="neutral" variant="link" class="px-0" trailing-icon="i-lucide-chevron-down" :label="t('create.payment')" />
                <template #content>
                  <UFormField :label="t('create.bank')" :hint="t('create.bankHint')" :description="t('create.paymentLater')" :help="t('create.bankPublic')">
                    <div class="grid gap-2 sm:grid-cols-3">
                      <UInput v-model="form.bankId" :placeholder="t('create.bankId')" />
                      <UInput v-model="form.bankAccount" :placeholder="t('create.bankAccount')" inputmode="numeric" />
                      <UInput v-model="form.bankHolder" :placeholder="t('create.bankHolder')" />
                    </div>
                  </UFormField>
                </template>
              </UCollapsible>
            </UCard>
          </div>
        </div>
      </UForm>
    </template>

    <!-- In the panel footer: always in reach, never over the form. The button submits the form by id. -->
    <template #footer>
      <div class="border-t border-default px-4 py-3 sm:px-6">
        <div class="mx-auto flex w-full max-w-5xl items-center justify-end gap-3">
          <p v-if="missing" class="text-sm text-muted">{{ t(missing) }}</p>
          <UButton type="submit" form="create-form" size="lg" icon="i-lucide-sparkles" :loading="busy" :disabled="!!missing">
            {{ t('create.submit') }}
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
