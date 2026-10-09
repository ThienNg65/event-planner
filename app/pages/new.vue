<script setup lang="ts">
const { t } = useI18n();
const toast = useToast();
const { meId } = useMe();

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
});
const busy = ref(false);

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
        createdBy: meId.value,
        pollDays: poll ? form.pollDays : [],
        startsAt: !poll && form.startsAt ? teamTime(...(form.startsAt.split('T') as [string, string])) : null,
        venue: fixedVenue ? form.venue : null,
        venueLink: fixedVenue ? form.venueLink : null,
        capacity: form.capacity || null,
        cover: form.cover,
        ...bank,
      },
    });
    try {
      localStorage.setItem(BANK, JSON.stringify(bank));
    } catch {
      /* not remembered, that's fine */
    }
    saveManageKey(res.id, res.key);
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
      <UCard v-if="!meId" class="mx-auto w-full max-w-5xl" :ui="{ root: 'ring-2 ring-primary/40', body: 'space-y-3' }">
        <p class="font-semibold text-highlighted">{{ t('next.who.title') }}</p>
        <MemberPicker />
      </UCard>

      <div class="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
        <span class="text-sm text-muted">{{ t('create.quickStart') }}</span>
        <UButton
          v-for="(tpl, i) in TEMPLATES"
          :key="tpl.key"
          size="sm"
          color="neutral"
          variant="outline"
          class="rounded-full"
          :label="templateTitles[i]"
          @click="applyTemplate(i)"
        />
      </div>

      <UForm :state="form" class="mx-auto w-full max-w-5xl space-y-6" @submit="create">
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
                <UInput v-if="form.dateMode === 'fixed'" v-model="form.startsAt" type="datetime-local" class="w-full" />
                <PollDaysInput v-else v-model="form.pollDays" />
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
                <UInputNumber v-model="form.capacity" :min="1" :max="500" class="w-40" />
              </UFormField>

              <UCollapsible class="space-y-3">
                <UButton color="neutral" variant="link" class="px-0" trailing-icon="i-lucide-chevron-down" :label="t('create.payment')" />
                <template #content>
                  <UFormField :label="t('create.bank')" :hint="t('create.bankHint')" :description="t('create.paymentLater')">
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

        <div class="flex flex-col items-end gap-2">
          <UButton type="submit" size="lg" icon="i-lucide-sparkles" :loading="busy" :disabled="!meId || !form.title.trim()">
            {{ t('create.submit') }}
          </UButton>
          <p v-if="!meId" class="text-sm text-muted">{{ t('create.pickFirst') }}</p>
        </div>
      </UForm>
    </template>
  </UDashboardPanel>
</template>
