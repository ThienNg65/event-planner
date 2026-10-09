<script setup lang="ts">
const { t, locale } = useI18n();
const toast = useToast();
const id = Number(useRoute().params.id);
const key = useManageKey(id);
const { me } = useMe();

const { data, refresh, error } = await useFetch(`/api/events/${id}`, {
  key: `event-${id}`,
  onRequest({ options }) {
    if (key.value) options.headers.set('x-manage-key', key.value);
  },
});
if (error.value) throw createError({ statusCode: 404, statusMessage: t('err.notFound'), fatal: true });
watch(key, (k) => k && refresh());

const ev = computed(() => data.value!.event);
const when = computed(() => (ev.value.startsAt ? fmtDateTime(ev.value.startsAt, locale.value) : t('event.dateTbd')));
const cover = computed(() => coverOf(ev.value.cover, ev.value.id));
const STAGES = ['poll', 'rsvp', 'bill', 'settled'] as const;
const steps = computed(() => STAGES.map((s) => ({ value: s, title: t(`stage.${s}`) })));
const editing = ref(false);
const attendees = computed(() => data.value!.confirmed.map((m) => data.value!.responses.find((r) => r.memberId === m)!));

useSeoMeta({
  title: () => ev.value.title,
  ogTitle: () => ev.value.title,
  description: () => [when.value, ev.value.venue].filter(Boolean).join(' · '),
  ogDescription: () => [when.value, ev.value.venue].filter(Boolean).join(' · '),
});

async function share() {
  const url = `${location.origin}/e/${id}`;
  try {
    const text = t(`share.${ev.value.stage}`, { title: ev.value.title });
    if (navigator.share) await navigator.share({ title: ev.value.title, text, url });
    else {
      await navigator.clipboard.writeText(url);
      toast.add({ title: t('event.linkCopied') });
    }
  } catch {
    /* share sheet dismissed */
  }
}
</script>

<template>
  <UDashboardPanel :id="`event-${id}`">
    <template #header>
      <UDashboardNavbar :title="ev.title">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UButton v-if="data?.manager && key" icon="i-lucide-pencil" color="neutral" variant="outline" @click="editing = true">{{ t('edit.open') }}</UButton>
          <UButton icon="i-lucide-share" color="neutral" variant="outline" @click="share">{{ t('event.share') }}</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="data" class="mx-auto w-full max-w-6xl space-y-6">
        <section class="relative overflow-hidden rounded-2xl" :class="'gradient' in cover && cover.gradient">
          <img v-if="'image' in cover" :src="cover.image" alt="" class="absolute inset-0 size-full object-cover" />
          <div class="relative flex min-h-36 flex-col justify-end gap-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-5 text-white sm:min-h-48 sm:p-6">
            <UBadge :color="STAGE_COLOR[ev.stage]" variant="solid" :label="t(`stage.${ev.stage}`)" class="self-start" />
            <h1 class="text-3xl font-bold tracking-tight break-words drop-shadow sm:text-4xl">{{ ev.title }}</h1>
            <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
              <span class="flex items-center gap-1.5"><UIcon name="i-lucide-calendar" />{{ when }}</span>
              <span v-if="ev.venue" class="flex items-center gap-1.5"><UIcon name="i-lucide-map-pin" />{{ ev.venue }}</span>
            </p>
          </div>
        </section>

        <UStepper :model-value="ev.stage" :items="steps" disabled size="sm" class="w-full" />

        <EventNextStep :data="data" :me="me" :manage-key="key" @changed="refresh" />

        <div class="grid items-start gap-6 lg:grid-cols-3">
          <div class="space-y-6 lg:col-span-2">
            <EventPoll :data="data" :me="me" :manage-key="key" @changed="refresh" />
            <EventRsvp :data="data" :me="me" :manage-key="key" @changed="refresh" />
            <EventBill :data="data" :me="me" :manage-key="key" @changed="refresh" />
          </div>

          <aside class="space-y-6 lg:sticky lg:top-4">
            <UCard>
              <template #header>{{ t('event.details') }}</template>
              <ul class="space-y-3 text-sm">
                <li class="flex items-start gap-3">
                  <UIcon name="i-lucide-calendar" class="mt-0.5 size-4 shrink-0 text-muted" />
                  <span :class="ev.startsAt ? 'text-highlighted' : 'text-muted'">{{ when }}</span>
                </li>
                <li v-if="ev.venue" class="flex items-start gap-3">
                  <UIcon name="i-lucide-map-pin" class="mt-0.5 size-4 shrink-0 text-muted" />
                  <ULink v-if="ev.venueLink" :to="ev.venueLink" target="_blank" rel="noopener noreferrer" class="text-primary">{{ ev.venue }}</ULink>
                  <span v-else class="text-highlighted">{{ ev.venue }}</span>
                </li>
                <li v-if="ev.stage !== 'poll'" class="flex items-start gap-3">
                  <UIcon name="i-lucide-users" class="mt-0.5 size-4 shrink-0 text-muted" />
                  <div class="flex-1">
                    <span class="text-highlighted tabular-nums">{{ ev.capacity ? `${data.seats}/${ev.capacity}` : data.seats }} {{ t('event.seats') }}</span>
                    <UProgress v-if="ev.capacity" :model-value="data.seats" :max="ev.capacity" size="xs" class="mt-1.5" />
                  </div>
                </li>
                <li v-if="ev.note" class="border-t border-default pt-3 whitespace-pre-line text-toned">{{ ev.note }}</li>
              </ul>
            </UCard>

            <UCard v-if="ev.stage !== 'poll'">
              <template #header>{{ t('event.attendees') }}</template>
              <div v-if="attendees.length" class="flex items-center justify-between gap-3">
                <UAvatarGroup :max="6" size="sm">
                  <UAvatar v-for="a in attendees" :key="a.memberId" :alt="a.name" :title="a.name" />
                </UAvatarGroup>
                <UBadge v-if="data.waitlist.length" color="warning" variant="subtle" :label="t('event.waitlist', { n: data.waitlist.length })" />
              </div>
              <p v-else class="text-sm text-muted">{{ t('event.nobody') }}</p>
            </UCard>
          </aside>
        </div>
        <EventEdit v-if="data.manager && key" v-model:open="editing" :data="data" :manage-key="key" @changed="refresh" />
      </div>
    </template>
  </UDashboardPanel>
</template>
