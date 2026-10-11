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
if (error.value) {
  const notFound = error.value.statusCode === 404;
  throw createError({ statusCode: notFound ? 404 : 500, statusMessage: t(notFound ? 'err.notFound' : 'err.generic'), fatal: true });
}
watch(key, async (k) => {
  if (!k) return;
  await refresh();
  // A revoked or rotated key no longer grants a role: forget it so home stops offering organizer todos.
  if (!error.value && data.value?.role === null) {
    forgetManageKey(id);
    key.value = null;
  }
});

const ev = computed(() => data.value!.event);
// The key is browser-only, so the server renders every visitor as a participant until it is known.
const role = computed<Role>(() => (key.value ? data.value!.role : null));
const when = computed(() => {
  if (ev.value.startsAt) return fmtDateTime(ev.value.startsAt, locale.value);
  return ev.value.pollDays.length ? t('card.voting', { n: ev.value.pollDays.length }) : t('event.dateTbd');
});
const cover = computed(() => coverOf(ev.value.cover, ev.value.id));
const editing = ref(false);
const STAGES = ['poll', 'rsvp', 'bill', 'settled'] as const;
const voters = computed(() => data.value!.responses.filter((r) => r.days.length || r.venueIds.length).length);
// Finished stages collapse to one line each.
const done = computed(() => {
  const past = STAGES.indexOf(ev.value.stage);
  const out: string[] = [];
  if (past > 0 && voters.value) out.push(t('sum.poll', { n: voters.value }));
  if (past > 1) out.push(t('sum.rsvp', { n: data.value!.seats }));
  return out;
});

// "New" dot on the host's update until this browser has seen that version of it.
const unseen = ref(false);
onMounted(() => {
  const at = ev.value.noticeAt;
  if (!at) return;
  try {
    const seen = JSON.parse(localStorage.getItem('te:notice') ?? '{}');
    unseen.value = seen[id] !== at;
    localStorage.setItem('te:notice', JSON.stringify({ ...seen, [id]: at }));
  } catch {
    /* storage blocked: the update just shows without the dot */
  }
});

const { call } = useEventApi(
  () => id,
  () => key.value
);
const restoreActions = computed(() =>
  can(role.value, 'cancel')
    ? [{ label: t('event.restore'), color: 'neutral' as const, variant: 'outline' as const, onClick: restore }]
    : []
);
async function restore() {
  if (await call('', 'PATCH', { restore: true })) await refresh();
}

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
          <UButton v-if="role" icon="i-lucide-settings-2" color="neutral" variant="outline" :aria-label="t('edit.open')" @click="editing = true">
            <span class="hidden sm:inline">{{ t('edit.open') }}</span>
          </UButton>
          <UButton icon="i-lucide-share" color="neutral" variant="outline" :aria-label="t('event.share')" @click="share">
            <span class="hidden sm:inline">{{ t('event.share') }}</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="data" class="mx-auto w-full max-w-3xl space-y-6">
        <header class="space-y-3">
          <div class="relative h-28 overflow-hidden rounded-2xl sm:h-36" :class="'gradient' in cover && cover.gradient">
            <img v-if="'image' in cover" :src="cover.image" alt="" class="absolute inset-0 size-full object-cover" />
          </div>
          <div class="space-y-1.5">
            <UBadge v-if="ev.cancelledAt" color="neutral" variant="subtle" :label="t('stage.cancelled')" />
            <UBadge v-else :color="STAGE_COLOR[ev.stage]" variant="subtle" :label="t(`stage.${ev.stage}`)" />
            <h1 class="text-2xl font-bold tracking-tight break-words text-highlighted sm:text-3xl">{{ ev.title }}</h1>
            <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span class="flex items-center gap-1.5"><UIcon name="i-lucide-calendar" />{{ when }}</span>
              <span v-if="ev.venue" class="flex items-center gap-1.5">
                <UIcon name="i-lucide-map-pin" />
                <ULink v-if="ev.venueLink" :to="ev.venueLink" target="_blank" rel="noopener noreferrer" class="text-primary">{{ ev.venue }}</ULink>
                <template v-else>{{ ev.venue }}</template>
              </span>
              <span class="flex items-center gap-1.5"><UIcon name="i-lucide-user-round" />{{ t('event.hostedBy', { name: data.hostName }) }}</span>
              <span v-if="ev.stage !== 'poll'" class="flex items-center gap-1.5">
                <UIcon name="i-lucide-users" />{{ t('event.goingCount', { n: ev.capacity ? `${data.seats}/${ev.capacity}` : data.seats }) }}
              </span>
            </p>
          </div>
        </header>

        <UAlert
          v-if="ev.cancelledAt"
          role="status"
          color="neutral"
          variant="subtle"
          icon="i-lucide-ban"
          :title="t('event.cancelledTitle')"
          :description="ev.cancelReason ?? undefined"
          :actions="restoreActions"
        />
        <UAlert v-if="ev.notice" role="status" color="info" variant="subtle" icon="i-lucide-megaphone" :description="ev.notice">
          <template #title>
            {{ t('event.noticeTitle') }}
            <UBadge v-if="unseen" color="secondary" variant="solid" size="sm" :label="t('event.new')" class="ml-1" />
          </template>
        </UAlert>

        <EventNextStep :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />

        <p v-for="line in done" :key="line" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-circle-check" class="size-4 text-success" />{{ line }}
        </p>

        <EventPoll v-if="ev.stage === 'poll'" :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
        <EventRsvp v-else-if="ev.stage === 'rsvp'" :data="data" :me="me" :manage-key="key" @changed="refresh" />
        <EventBill v-else :data="data" :me="me" :manage-key="key" @changed="refresh" />

        <EventPeople :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />

        <p v-if="ev.note" class="border-t border-default pt-4 text-sm whitespace-pre-line text-toned">{{ ev.note }}</p>

        <EventEdit v-if="role && key" v-model:open="editing" :data="data" :manage-key="key" :role="role" @changed="refresh" />
      </div>
    </template>
  </UDashboardPanel>
</template>
