<script setup lang="ts">
const { t, locale } = useI18n();
const toast = useToast();
const id = Number(useRoute().params.id);
const key = useManageKey(id);
const { me, members } = useMe();

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
// A revoked or rotated key no longer grants a role: forget it so home stops offering organizer todos.
function dropRejectedKey() {
  if (!error.value && data.value?.role === null) {
    forgetManageKey(id);
    key.value = null;
  }
}
// On in-app navigation the key is already set (the watch below never fires), so check the first response too.
if (key.value) dropRejectedKey();
watch(key, async (k) => {
  if (!k) return;
  await refresh();
  dropRejectedKey();
});

const ev = computed(() => data.value!.event);
// The key is browser-only, so the server renders every visitor as a participant until it is known.
// Browser-only too: with a member picked, organizer rights show only for the creator or an active co-host, so switching to
// another member shows the participant view (UI only: the key in this browser is still accepted by the server).
const role = computed<Role>(() => {
  if (!key.value) return null;
  const d = data.value!;
  const id = me.value?.id;
  if (id === undefined || id === d.event.createdBy || d.cohosts.some((c) => c.memberId === id && c.status === 'active')) return d.role;
  return null;
});
const when = computed(() => {
  if (ev.value.startsAt) return fmtDateTime(ev.value.startsAt, locale.value);
  return ev.value.pollDays.length ? t('card.voting', { n: ev.value.pollDays.length }) : t('event.dateTbd');
});
const cover = computed(() => coverOf(ev.value.cover, ev.value.id));
useEventTheme(() => ev.value.theme);
const editing = ref(false);
const organizing = ref(false);

// A co-host invite arrives as /e/:id#invite=<secret>. The fragment is never sent to a server; it is read here, removed from
// the address bar, and kept only in sessionStorage until the invitee accepts or declines (never alongside the manage keys).
const INVITE_STORE = `te:invite:${id}`;
const invite = ref('');
const peek = ref<{ memberId: number; name: string; status: 'valid' | 'expired' } | 'invalid' | null>(null);
const inviteBusy = ref(false);
const inviteError = ref('');
async function peekInvite() {
  if (!invite.value) return;
  try {
    peek.value = await $fetch(`/api/events/${id}/cohosts/peek`, { method: 'POST', body: { invite: invite.value } });
  } catch {
    peek.value = 'invalid';
    forgetInvite();
  }
}
function forgetInvite() {
  invite.value = '';
  try {
    sessionStorage.removeItem(INVITE_STORE);
  } catch {
    /* storage blocked: nothing kept */
  }
}
onMounted(() => {
  try {
    const fromUrl = new URLSearchParams(location.hash.slice(1)).get('invite');
    if (fromUrl) {
      sessionStorage.setItem(INVITE_STORE, fromUrl);
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    invite.value = sessionStorage.getItem(INVITE_STORE) ?? '';
  } catch {
    /* storage blocked: the invite link has to be opened again */
  }
  peekInvite();
});
const inviteForMe = computed(() => typeof peek.value === 'object' && peek.value !== null && peek.value.memberId === me.value?.id);
async function answerInvite(accept: boolean) {
  inviteBusy.value = true;
  inviteError.value = '';
  try {
    const res = await $fetch<{ key?: string }>(`/api/events/${id}/cohosts/${accept ? 'accept' : 'decline'}`, { method: 'POST', body: { invite: invite.value } });
    forgetInvite();
    peek.value = null;
    if (accept && res.key) {
      saveManageKey(id, res.key);
      key.value = res.key;
      toast.add({ title: t('invite.accepted') });
    }
    await refresh();
  } catch (e) {
    inviteError.value = errMsg(e);
    if ((e as { statusCode?: number }).statusCode !== 403) {
      forgetInvite();
      peek.value = 'invalid';
    }
  } finally {
    inviteBusy.value = false;
  }
}
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

// Link previews (chat apps, social): crawlers read these from the server-rendered HTML and need absolute URLs.
const origin = useRequestURL().origin;
const blurb = computed(() => [when.value, ev.value.venue].filter(Boolean).join(' · '));
// The card image is made on the server: the event's cover with the QR code of its link on top.
const cardImage = computed(() => `${origin}/api/events/${id}/card?v=${coverTag(ev.value.cover)}`);
useSeoMeta({
  title: () => ev.value.title,
  description: () => blurb.value,
  ogType: 'website',
  ogSiteName: () => t('app.name'),
  ogUrl: `${origin}/e/${id}`,
  ogTitle: () => ev.value.title,
  ogDescription: () => blurb.value,
  ogImage: () => cardImage.value,
  ogImageType: 'image/png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: () => ev.value.title,
  twitterCard: 'summary_large_image',
  twitterTitle: () => ev.value.title,
  twitterDescription: () => blurb.value,
  twitterImage: () => cardImage.value,
});

const sharing = ref(false);
const share = () => (sharing.value = true);
</script>

<template>
  <UDashboardPanel :id="`event-${id}`">
    <template #header>
      <UDashboardNavbar :title="ev.title">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UButton icon="i-lucide-share" color="neutral" variant="outline" :aria-label="t('event.share')" @click="share">
            <span class="hidden sm:inline">{{ t('event.share') }}</span>
          </UButton>
          <UButton v-if="role" icon="i-lucide-pencil" color="neutral" variant="outline" :aria-label="t('edit.open')" @click="editing = true">
            <span class="hidden sm:inline">{{ t('edit.open') }}</span>
          </UButton>
          <EventHostMenu v-if="can(role, 'cancel') && key" :data="data!" :manage-key="key" @changed="refresh" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="data" class="mx-auto grid w-full max-w-3xl gap-x-8 gap-y-6 lg:max-w-7xl lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="min-w-0 space-y-6 lg:col-start-1">
          <header class="space-y-3">
            <div class="relative overflow-hidden rounded-xl" :class="['image' in cover ? 'h-44 sm:h-52' : 'h-28', 'gradient' in cover && cover.gradient]">
              <img v-if="'image' in cover" :src="cover.image" alt="" class="absolute inset-0 size-full object-cover" />
              <UButton
                v-if="can(role, 'edit')"
                icon="i-lucide-camera"
                size="sm"
                class="absolute right-3 bottom-3 bg-black/50 text-white backdrop-blur hover:bg-black/70"
                @click="editing = true"
              >
                {{ t('event.changeCover') }}
              </UButton>
            </div>
            <div class="space-y-1.5">
              <div class="flex min-h-7 items-center justify-between gap-2">
                <UBadge v-if="ev.cancelledAt" color="neutral" variant="subtle" :label="t('stage.cancelled')" class="rounded-full px-2.5" />
                <UBadge v-else :color="STAGE_COLOR[ev.stage]" variant="subtle" :label="t(`stage.${ev.stage}`)" class="rounded-full px-2.5" />
                <UButton v-if="canPost && !ev.notice" icon="i-lucide-megaphone" color="neutral" variant="ghost" size="xs" @click="openNotice">{{ t('post.open') }}</UButton>
              </div>
              <h1 class="text-2xl font-bold tracking-tight break-words text-highlighted sm:text-4xl">{{ ev.title }}</h1>
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

          <UAlert
            v-if="peek"
            role="status"
            :color="typeof peek === 'object' && peek.status === 'valid' ? 'primary' : 'warning'"
            variant="subtle"
            icon="i-lucide-user-plus"
            :title="typeof peek === 'object' && peek.status === 'valid' ? t('invite.title', { name: peek.name }) : t('invite.invalid')"
            :description="typeof peek === 'object' && peek.status === 'expired' ? t('invite.expired') : undefined"
          >
            <template v-if="typeof peek === 'object' && peek.status === 'valid'" #description>
              <div class="space-y-2">
                <p v-if="inviteForMe">{{ t('invite.body') }}</p>
                <template v-else>
                  <p>{{ t('invite.notYou', { name: peek.name }) }}</p>
                  <MemberPicker />
                </template>
                <p v-if="inviteError" class="text-error">{{ inviteError }}</p>
                <div class="flex flex-wrap gap-2">
                  <UButton :loading="inviteBusy" :disabled="!inviteForMe" @click="answerInvite(true)">{{ t('invite.accept') }}</UButton>
                  <UButton color="neutral" variant="ghost" :disabled="inviteBusy" @click="answerInvite(false)">{{ t('invite.decline') }}</UButton>
                </div>
              </div>
            </template>
          </UAlert>

          <EventNextStep :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
        </div>

        <aside class="grid content-start gap-4 sm:grid-cols-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:grid-cols-1 lg:self-start lg:sticky lg:top-0">
          <EventOverview :data="data" :role="role" @invite="share" />
          <section v-if="members.length" class="space-y-3 rounded-2xl p-5 shadow-xs ring ring-default" :aria-label="t('members.title')">
            <h2 class="flex items-center gap-2 font-semibold text-highlighted">
              <UIcon name="i-lucide-users-round" class="size-5" />{{ t('members.title') }}
              <span class="ml-auto text-xs font-normal text-muted tabular-nums">{{ t('members.count', { n: members.length }) }}</span>
            </h2>
            <UAvatarGroup :max="6" size="lg">
              <UAvatar v-for="m in members" :key="m.id" :alt="m.name" :title="m.name" />
            </UAvatarGroup>
          </section>
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
      <EventShareDialog v-model:open="sharing" :id="id" :title="ev.title" :stage="ev.stage" />
    </template>
  </UDashboardPanel>
</template>
