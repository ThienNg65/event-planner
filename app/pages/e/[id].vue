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
const organizing = ref(false);
// Long notes show three lines and expand on request.
const noteOpen = ref(false);
const longNote = computed(() => (ev.value.note?.length ?? 0) > 150 || (ev.value.note?.split('\n').length ?? 0) > 3);
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

const { busy, call } = useEventApi(
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

// The host's update publishes at once (unlike the drawer, which saves on request).
const canPost = computed(() => can(role.value, 'edit') && !ev.value.cancelledAt);
const posting = ref(false);
const noticeText = ref('');
function openNotice() {
  noticeText.value = ev.value.notice ?? '';
  posting.value = true;
}
async function postNotice(text: string) {
  if (!(await call('', 'PATCH', { notice: text }))) return;
  posting.value = false;
  await refresh();
}
const noticeActions = computed(() =>
  canPost.value ? [{ label: t('post.edit'), color: 'neutral' as const, variant: 'outline' as const, onClick: openNotice }] : []
);

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
          <UButton v-if="role" icon="i-lucide-pencil" color="neutral" variant="outline" :aria-label="t('edit.open')" @click="editing = true">
            <span class="hidden sm:inline">{{ t('edit.open') }}</span>
          </UButton>
          <UButton icon="i-lucide-share" color="neutral" variant="outline" :aria-label="t('event.share')" @click="share">
            <span class="hidden sm:inline">{{ t('event.share') }}</span>
          </UButton>
          <EventHostMenu v-if="can(role, 'cancel') && key" :data="data!" :manage-key="key" @changed="refresh" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="data" class="mx-auto grid w-full max-w-3xl gap-x-8 gap-y-6 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div class="min-w-0 space-y-6 lg:col-start-1">
          <header class="space-y-3">
            <div class="relative overflow-hidden rounded-2xl" :class="['image' in cover ? 'h-40' : 'h-24', 'gradient' in cover && cover.gradient]">
              <img v-if="'image' in cover" :src="cover.image" alt="" class="absolute inset-0 size-full object-cover" />
            </div>
            <div class="space-y-1.5">
              <div class="flex min-h-7 items-center justify-between gap-2">
                <UBadge v-if="ev.cancelledAt" color="neutral" variant="subtle" :label="t('stage.cancelled')" />
                <UBadge v-else :color="STAGE_COLOR[ev.stage]" variant="subtle" :label="t(`stage.${ev.stage}`)" />
                <UButton v-if="canPost && !ev.notice" icon="i-lucide-megaphone" color="neutral" variant="ghost" size="xs" @click="openNotice">{{ t('post.open') }}</UButton>
              </div>
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
              <div v-if="ev.note" class="text-sm text-toned">
                <p class="whitespace-pre-line" :class="!noteOpen && 'line-clamp-3'">{{ ev.note }}</p>
                <button v-if="longNote" type="button" class="mt-1 text-primary underline underline-offset-2" :aria-expanded="noteOpen" @click="noteOpen = !noteOpen">
                  {{ t(noteOpen ? 'event.less' : 'event.more') }}
                </button>
              </div>
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
          <UAlert v-if="ev.notice" role="status" color="info" variant="subtle" icon="i-lucide-megaphone" :description="ev.notice" :actions="noticeActions">
            <template #title>
              {{ t('event.noticeTitle') }}
              <UBadge v-if="unseen" color="secondary" variant="solid" size="sm" :label="t('event.new')" class="ml-1" />
            </template>
          </UAlert>

          <EventNextStep :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
        </div>

        <aside class="grid content-start gap-4 sm:grid-cols-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:grid-cols-1 lg:self-start lg:sticky lg:top-4">
          <EventOverview :data="data" :role="role" />
          <EventOrganizers :data="data" :role="role" @manage="organizing = true" />
        </aside>

        <div class="min-w-0 space-y-6 lg:col-start-1">
          <p v-for="line in done" :key="line" class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-circle-check" class="size-4 text-success" />{{ line }}
          </p>

          <EventPoll v-if="ev.stage === 'poll'" :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
          <EventRsvp v-else-if="ev.stage === 'rsvp'" :data="data" :me="me" :manage-key="key" @changed="refresh" />
          <EventBill v-else :data="data" :me="me" :manage-key="key" @changed="refresh" />

          <EventPeople :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
        </div>

        <EventEdit v-if="role && key" v-model:open="editing" :data="data" :manage-key="key" @changed="refresh" />
        <EventOrganizersDialog v-if="role && key" v-model:open="organizing" :data="data" :manage-key="key" :role="role" @changed="refresh" />

        <UModal v-model:open="posting" :title="t('post.title')" :description="t('post.body')">
          <template #body>
            <UTextarea v-model="noticeText" :maxlength="280" :rows="3" class="w-full" :aria-label="t('post.title')" />
          </template>
          <template #footer>
            <div class="flex w-full items-center justify-end gap-2">
              <UButton v-if="ev.notice" color="neutral" variant="ghost" class="mr-auto" :loading="busy" @click="postNotice('')">{{ t('post.remove') }}</UButton>
              <UButton color="neutral" variant="ghost" @click="posting = false">{{ t('cancel') }}</UButton>
              <UButton :loading="busy" :disabled="!noticeText.trim()" @click="postNotice(noticeText)">{{ t('post.publish') }}</UButton>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
