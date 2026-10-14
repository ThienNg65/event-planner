<script setup lang="ts">
const { t, locale } = useI18n();
const toast = useToast();
const id = Number(useRoute().params.id);
const key = useManageKey(id);
const { me, meId } = useMe();
const route = useRoute();

const { data, refresh, error } = await useFetch(`/api/events/${id}`, {
  key: `event-${id}`,
  onRequest({ options }) {
    // ?key= is read by useManageKey only after hydration, so SSR takes it from the URL too (else a forwarded manage link would 404).
    const k = key.value ?? (typeof route.query.key === 'string' ? route.query.key : null);
    if (k) options.headers.set('x-manage-key', k);
    // ?join= stays in the address bar, so SSR, refresh() and the sign-in refresh all carry it.
    if (typeof route.query.join === 'string') options.headers.set('x-join-key', route.query.join);
  },
});
if (error.value) {
  const notFound = error.value.statusCode === 404;
  throw createError({ statusCode: notFound ? 404 : 500, statusMessage: t(notFound ? 'event.private' : 'err.generic'), fatal: true });
}
// A revoked or rotated key no longer grants a role: forget it so home stops offering organizer todos. The creator stays host
// through their session, so a rotated-out key is told apart by `hostKey`.
function dropRejectedKey() {
  if (!error.value && data.value && (data.value.role === null || (data.value.role === 'host' && !data.value.hostKey))) {
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
// The server decides: the signed-in member (known during SSR too) or a manage key held by this browser.
const role = computed<Role>(() => data.value!.role);
watch(meId, () => refresh());
const when = computed(() => {
  if (ev.value.startsAt) return fmtDateTime(ev.value.startsAt, locale.value);
  return ev.value.pollDays.length ? t('event.dayOptions', { n: ev.value.pollDays.length }) : t('event.dateTbd');
});
const dateTile = computed(() => ev.value.startsAt && dateBlock(ev.value.startsAt, locale.value));
// Steps are named by what happens in them; the current one uses the badge wording ("Đã chốt", "Awaiting the date"...).
const steps = computed(() => STAGES.map((s) => ({ title: s === ev.value.stage ? t(`stage.${stageKey(ev.value)}`) : t(`stages.${s}`) })));
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
// "@Dong Le" in the note shows as a chip.
const noteParts = computed(() => splitMentions(ev.value.note ?? ''));
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
const cardImage = computed(() => `${origin}/api/events/${id}/card?v=${coverTag(ev.value.cover)}&j=${ev.value.joinKey}`);
useSeoMeta({
  title: () => ev.value.title,
  description: () => blurb.value,
  ogType: 'website',
  ogSiteName: () => t('app.name'),
  ogUrl: () => `${origin}/e/${id}?join=${ev.value.joinKey}&s=${ev.value.stage}`,
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

// The sticky sidebar stays short: a big team shows its first faces and a "+N".
const AVATARS = 20;
// Members who said they can't join get a mark on their avatar.
const people = computed(() => data.value!.participants);
// The server says when this visit made you a participant (SSR or after picking your name).
watch(
  () => data.value?.joinedNow,
  (j) => {
    if (import.meta.client && j) toast.add({ title: t('event.joined', { title: ev.value.title }), icon: 'i-lucide-party-popper' });
  },
  { immediate: true }
);
const declined = computed(() => new Set(data.value!.responses.filter((r) => r.status === 'no').map((r) => r.memberId)));
// Any stage, as long as the date is set and the event still happens.
const googleCalendar = computed(() => (ev.value.startsAt && !ev.value.cancelledAt ? googleCalendarUrl({ ...ev.value, startsAt: ev.value.startsAt }, origin) : null));
const sharing = ref(false);
const share = () => (sharing.value = true);

// A new event opens its share dialog once, then (only if the creator has no PIN) offers to set one or save the sign-in link, once. The flag lives in memory only, so a refresh does not repeat it.
const justCreated = useState<number>('justCreated', () => 0);
const keeping = ref(false);
let afterCreate = false;
onMounted(() => {
  if (justCreated.value !== id) return;
  justCreated.value = 0;
  afterCreate = true;
  sharing.value = true;
});
watch(sharing, (open) => {
  if (open || !afterCreate) return;
  afterCreate = false;
  if (me.value && !me.value.hasPin) keeping.value = true;
});
const reminding = computed(() => can(role.value, 'remind') && !ev.value.cancelledAt && (ev.value.stage !== 'poll' || votingOpen(ev.value)) && stageKey(ev.value) !== 'awaitingBill' && ev.value.stage !== 'settled' && (ev.value.stage !== 'bill' || data.value!.share !== null));
</script>

<template>
  <UDashboardPanel :id="`event-${id}`">
    <template #header>
      <!-- No navbar title here: the event title below is the page heading, and a second h1 would repeat it. -->
      <UDashboardNavbar :ui="{ center: 'flex-1 justify-center' }">
        <template #leading><UDashboardSidebarCollapse /></template>
        <!-- The navbar centre shows only on lg+; smaller screens get the stage badge in the header instead. -->
        <UStepper
          v-if="data && !ev.cancelledAt"
          :items="steps"
          :model-value="STAGES.indexOf(ev.stage)"
          :color="STAGE_COLOR[ev.stage]"
          size="xs"
          disabled
          :aria-label="t('stages.label')"
          class="w-full max-w-xl"
        />
        <template #right>
          <UButton v-if="data && canPost && !ev.notice" icon="i-lucide-megaphone" color="neutral" variant="outline" :aria-label="t('post.open')" @click="openNotice">
            <span class="hidden sm:inline">{{ t('post.open') }}</span>
          </UButton>
          <UButton icon="i-lucide-share" color="neutral" variant="outline" :aria-label="t('event.share')" @click="share">
            <span class="hidden sm:inline">{{ t('event.share') }}</span>
          </UButton>
          <UButton v-if="role" icon="i-lucide-pencil" color="neutral" variant="outline" :aria-label="t('edit.open')" @click="editing = true">
            <span class="hidden sm:inline">{{ t('edit.open') }}</span>
          </UButton>
          <EventHostMenu v-if="can(role, 'cancel')" :data="data!" :manage-key="key" @changed="refresh" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="data" class="mx-auto grid w-full max-w-3xl gap-x-8 gap-y-6 lg:max-w-7xl lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
        <div class="rise min-w-0 space-y-6 lg:col-start-1">
          <!-- Luma-style: on sm+ a square cover sits beside the title; on phones it is a strip on top. -->
          <header class="space-y-3 sm:flex sm:items-start sm:gap-5 sm:space-y-0">
            <div class="relative shrink-0 overflow-hidden rounded-xl sm:size-40" :class="['image' in cover ? 'h-44' : 'h-20', 'gradient' in cover && cover.gradient]">
              <img v-if="'image' in cover" :src="cover.image" alt="" class="absolute inset-0 size-full object-cover" />
              <UButton
                v-if="can(role, 'edit')"
                icon="i-lucide-camera"
                size="sm"
                :aria-label="t('event.changeCover')"
                class="absolute right-2 bottom-2 bg-black/50 text-white backdrop-blur hover:bg-black/70"
                @click="editing = true"
              >
                <span class="sm:sr-only">{{ t('event.changeCover') }}</span>
              </UButton>
            </div>
            <div class="min-w-0 flex-1 space-y-3">
              <!-- lg+ shows the stage in the navbar stepper instead. -->
              <div class="flex" :class="!ev.cancelledAt && 'lg:hidden'">
                <UBadge v-if="ev.cancelledAt" color="neutral" variant="subtle" :label="t('stage.cancelled')" class="rounded-full px-2.5" />
                <UBadge v-else :color="STAGE_COLOR[ev.stage]" variant="subtle" :label="t(`stage.${stageKey(ev)}`)" class="rounded-full px-2.5" />
              </div>
              <h1 class="text-2xl font-bold tracking-tight break-words text-highlighted sm:text-4xl">{{ ev.title }}</h1>
              <!-- One row per key fact: an icon tile (the date tile once the date is set), then the fact. -->
              <div class="flex items-center gap-3">
                <div v-if="dateTile" class="grid size-12 shrink-0 place-content-center rounded-lg text-center ring ring-default">
                  <span class="text-[0.625rem] leading-tight font-semibold whitespace-nowrap text-primary uppercase">{{ dateTile.month }}</span>
                  <span class="text-base leading-tight font-bold text-highlighted">{{ dateTile.day }}</span>
                </div>
                <span v-else class="grid size-12 shrink-0 place-items-center rounded-lg ring ring-default"><UIcon name="i-lucide-calendar" class="size-5 text-muted" /></span>
                <p class="font-medium text-highlighted">{{ when }}</p>
              </div>
              <div v-if="ev.venue" class="flex items-center gap-3">
                <span class="grid size-12 shrink-0 place-items-center rounded-lg ring ring-default"><UIcon name="i-lucide-map-pin" class="size-5 text-muted" /></span>
                <p class="min-w-0 font-medium break-words text-highlighted">
                  <ULink v-if="ev.venueLink" :to="ev.venueLink" target="_blank" rel="noopener noreferrer" class="text-primary">{{ ev.venue }}</ULink>
                  <template v-else>{{ ev.venue }}</template>
                  <VenueMap :name="ev.venue" :link="ev.venueLink" />
                </p>
              </div>
              <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <span class="flex items-center gap-1.5"><UIcon name="i-lucide-user-round" />{{ t('event.hostedBy', { name: data.hostName }) }}</span>
                <span v-if="ev.stage !== 'poll'" class="flex items-center gap-1.5">
                  <UIcon name="i-lucide-users" />{{ t('event.goingCount', { n: ev.capacity ? `${data.seats}/${ev.capacity}` : data.seats }) }}
                </span>
              </p>
              <p v-if="googleCalendar" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-calendar-plus" />{{ t('event.addToCalendar') }}</span>
                <a :href="`/api/events/${id}/ics?j=${ev.joinKey}`" download class="text-primary underline-offset-2 hover:underline">{{ t('event.calendarFile') }}</a>
                <ULink :href="googleCalendar" target="_blank" rel="noopener noreferrer" class="text-primary">{{ t('event.googleCalendar') }}</ULink>
              </p>
              <div v-if="ev.note" class="text-sm text-toned">
                <p class="whitespace-pre-line" :class="!noteOpen && 'line-clamp-3'">
                  <template v-for="(part, i) in noteParts" :key="i"><span v-if="i % 2" class="rounded bg-primary/10 px-1 font-medium text-primary">{{ part }}</span><template v-else>{{ part }}</template></template>
                </p>
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
          <UAlert v-if="ev.notice" role="status" color="info" variant="subtle" icon="i-lucide-megaphone" :description="ev.notice" :actions="noticeActions" :ui="{ title: 'text-highlighted', description: 'text-default' }">
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
                  <MemberPicker v-if="!me" />
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
          <!-- The message holds the page's own origin, which only the browser knows. -->
          <ClientOnly>
            <EventReminder v-if="reminding" :data="data" />
            <template #fallback><div v-if="reminding" class="min-h-48" aria-hidden="true" /></template>
          </ClientOnly>
        </div>

        <!-- order-last: on phones the stats come after the stage section, so the action is first. -->
        <aside class="rise order-last grid content-start gap-3 sm:grid-cols-2 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:grid-cols-1 lg:self-start lg:sticky lg:top-0">
          <EventOverview :data="data" :role="role" @invite="share" />
          <section v-if="people.length" class="space-y-2.5 themed-surface p-4" :aria-label="t('members.title')">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon name="i-lucide-users-round" class="size-4 text-muted" />{{ t('members.title') }}
              <span class="ml-auto text-xs font-normal text-muted tabular-nums">{{ t('members.count', { n: people.length }) }}</span>
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <UTooltip v-for="m in people.slice(0, AVATARS)" :key="m.id" :delay-duration="0" :text="declined.has(m.id) ? `${m.name} · ${t('people.no')}` : m.name">
                <span class="relative" tabindex="0">
                  <MemberAvatar :id="m.id" :name="m.name" size="md" :class="declined.has(m.id) && 'opacity-50 grayscale'" />
                  <!-- The background sits on a wrapper: on the icon itself it would replace the masked glyph's color. -->
                  <span v-if="declined.has(m.id)" role="img" :aria-label="t('people.no')" class="absolute -right-1.5 -bottom-1.5 grid place-items-center rounded-full bg-default">
                    <UIcon name="i-lucide-circle-slash" class="size-4 text-error" />
                  </span>
                </span>
              </UTooltip>
              <span v-if="people.length > AVATARS" class="grid h-8 min-w-8 place-items-center rounded-lg bg-elevated px-1.5 text-xs font-medium text-muted tabular-nums">
                +{{ people.length - AVATARS }}
              </span>
            </div>
          </section>
          <EventOrganizers :data="data" :role="role" @manage="organizing = true" />
        </aside>

        <div class="rise min-w-0 space-y-6 lg:col-start-1">
          <p v-for="line in done" :key="line" class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-circle-check" class="size-4 text-success" />{{ line }}
          </p>

          <Transition name="stage" mode="out-in">
            <EventPoll v-if="ev.stage === 'poll'" :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
            <EventRsvp v-else-if="ev.stage === 'rsvp'" :data="data" :me="me" :manage-key="key" @changed="refresh" />
            <EventBill v-else :data="data" :me="me" :manage-key="key" @changed="refresh" />
          </Transition>

          <EventPeople :data="data" :me="me" :manage-key="key" :role="role" @changed="refresh" />
        </div>

        <!-- Organizer-only panels: kept out of SSR, where they would not hydrate cleanly. -->
        <ClientOnly>
          <EventEdit v-if="role" v-model:open="editing" :data="data" :manage-key="key" @changed="refresh" />
          <EventOrganizersDialog v-if="role" v-model:open="organizing" :data="data" :manage-key="key" :role="role" @changed="refresh" @rekeyed="key = $event" />
        </ClientOnly>

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
      <EventShareDialog v-model:open="sharing" :event="ev" />
      <ClientOnly><EventKeepAccess v-model:open="keeping" /></ClientOnly>
    </template>
  </UDashboardPanel>
</template>
