<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

const { t, locale, locales, setLocale } = useI18n();
const lang = useCookie<typeof locale.value>('lang', { maxAge: 60 * 60 * 24 * 365 });
const toast = useToast();
const { me, meId, members, refreshMe, refresh: refreshMembers } = useMe();
const whoOpen = ref(false);
const appTheme = useAppTheme();
const settingsOpen = ref(false);
watch(meId, () => (whoOpen.value = false));

// The sign-in link is fetched when the menu opens: Safari rejects clipboard writes that follow an await.
const signInLink = ref('');
async function loadLink() {
  try {
    const { token } = await $fetch('/api/me/link', { method: 'POST' });
    signInLink.value = `${location.origin}/#signin=${token}`;
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
}
watch(whoOpen, (o) => {
  if (o && me.value && !signInLink.value) loadLink();
});
watch(meId, () => (signInLink.value = ''));
async function copyLink() {
  try {
    await navigator.clipboard.writeText(signInLink.value);
    toast.add({ title: t('me.linkCopied'), description: t('me.linkHint') });
  } catch {
    /* clipboard blocked: the link is still shown to copy by hand */
  }
}

// Signing out the other devices also kills the old sign-in link, so it asks first. This device gets a new token and stays in.
const confirmOthers = ref(false);
// A member with a PIN proves it again to sign out other devices or to change it, so a stolen session can't lock them out.
const currentPin = ref('');
watch(currentPin, (v) => (currentPin.value = v.replace(/\D/g, '')));
// The confirm opens with focus on Cancel, never on the destructive button.
const othersCancel = useTemplateRef<{ $el: HTMLElement }>('othersCancel');
watch(confirmOthers, async (c) => {
  if (!c) return;
  await nextTick();
  othersCancel.value?.$el.focus();
});
async function signOutOthers() {
  try {
    await $fetch('/api/me/signout-others', { method: 'POST', body: { currentPin: currentPin.value } });
    confirmOthers.value = false;
    currentPin.value = '';
    signInLink.value = '';
    await loadLink();
    toast.add({ title: t('me.othersOut'), description: t('me.othersOutHint') });
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
}

// Sign in again with the PIN, or (no PIN yet) with the sign-in link, so signing out asks first.
const confirmSignOut = ref(false);

// Set the first PIN, or change it (the current PIN is asked for too).
const pinEditing = ref(false);
const newPin = ref('');
const pinBusy = ref(false);
watch(newPin, (v) => (newPin.value = v.replace(/\D/g, '')));
watch(whoOpen, () => {
  confirmSignOut.value = false;
  confirmOthers.value = false;
  pinEditing.value = false;
  newPin.value = '';
  currentPin.value = '';
});
const pinProblemKey = computed(() => (newPin.value.length === PIN_LENGTH ? pinProblem(newPin.value) : null));
async function savePin() {
  pinBusy.value = true;
  try {
    await $fetch('/api/me/pin', { method: 'POST', body: { pin: newPin.value, currentPin: currentPin.value } });
    pinEditing.value = false;
    newPin.value = '';
    currentPin.value = '';
    await refreshMe();
    toast.add({ title: t('pin.saved') });
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    pinBusy.value = false;
  }
}
async function signOut() {
  try {
    await $fetch('/api/me/signout', { method: 'POST' });
    forgetAllManageKeys();
    // A full reload, so an open event page also drops the organizer key it holds in memory.
    reloadNuxtApp({ force: true });
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
}

// Organizers tidy the roster: an archived member drops out of the name list and "no reply yet" until they sign in again.
const teamOpen = ref(false);
const archiving = ref<number | null>(null);
// An organizer hands a member who lost their PIN a new one; it is shown once, to pass on.
const resetting = ref<number | null>(null);
const resetResult = ref<{ name: string; pin: string } | null>(null);
async function resetPin(m: { id: number; name: string }) {
  resetting.value = m.id;
  try {
    const { pin } = await $fetch(`/api/members/${m.id}/pin-reset`, { method: 'POST' });
    resetResult.value = { name: m.name, pin };
    await refreshMembers();
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    resetting.value = null;
  }
}
watch(teamOpen, () => (resetResult.value = null));
async function archive(id: number) {
  archiving.value = id;
  try {
    await $fetch(`/api/members/${id}/archive`, { method: 'POST' });
    await refreshMembers();
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    archiving.value = null;
  }
}

// A sign-in link arrives as /#signin=<token>; the fragment never reaches a server log. It is used once, then removed.
onMounted(async () => {
  const token = new URLSearchParams(location.hash.slice(1)).get('signin');
  if (!token) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  try {
    await $fetch('/api/me/signin', { method: 'POST', body: { token } });
    await Promise.all([refreshMe(), refreshMembers()]);
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
});

function pick(code: typeof locale.value) {
  lang.value = code;
  setLocale(code);
}

const nav = computed<NavigationMenuItem[]>(() => [
  { label: t('nav.events'), icon: 'i-lucide-layout-grid', to: '/' },
  { label: t('nav.calendar'), icon: 'i-lucide-calendar-days', to: '/calendar' },
  { label: t('nav.new'), icon: 'i-lucide-circle-plus', to: '/new' },
]);
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar collapsible resizable :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink to="/" :aria-label="t('app.home')" class="flex items-center gap-2 font-semibold text-highlighted">
          <img src="/logo.svg" alt="" class="size-8 shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ t('app.name') }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="nav" orientation="vertical" tooltip />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-2">
          <UPopover v-model:open="whoOpen" :content="{ side: 'top', align: 'start' }">
            <UButton color="neutral" variant="ghost" block class="gap-2 px-1.5" :class="collapsed ? 'justify-center' : 'justify-start'" :aria-label="t('me.label')">
              <MemberAvatar v-if="me" :id="me.id" :name="me.name" />
              <UAvatar v-else icon="i-lucide-user-round" size="sm" />
              <span v-if="!collapsed" class="min-w-0 text-left">
                <span class="block truncate font-medium text-highlighted">{{ me?.name ?? t('me.label') }}</span>
                <span class="block truncate text-xs font-normal text-muted">{{ me ? t('me.signedIn') : t('me.pick') }}</span>
              </span>
            </UButton>
            <template #content>
              <div class="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3">
                <p class="text-sm font-semibold text-highlighted">{{ t('me.label') }}</p>
                <div v-if="me" class="space-y-2">
                  <p class="text-sm">{{ me.name }}</p>
                  <p v-if="!me.hasPin && !pinEditing" class="text-xs text-warning">{{ t('me.noPinNudge') }}</p>
                  <form v-if="pinEditing" class="space-y-2" @submit.prevent="savePin">
                    <UInput v-if="me.hasPin" v-model="currentPin" type="password" inputmode="numeric" autocomplete="current-password" autofocus :maxlength="PIN_LENGTH" :placeholder="t('pin.current')" :aria-label="t('pin.current')" class="w-full" />
                    <div class="flex gap-2">
                      <UInput v-model="newPin" type="password" inputmode="numeric" autocomplete="new-password" :autofocus="!me.hasPin" :maxlength="PIN_LENGTH" :placeholder="t('pin.choose')" :aria-label="t('pin.label')" class="flex-1" />
                      <UButton type="submit" :loading="pinBusy" :disabled="newPin.length !== PIN_LENGTH || !!pinProblemKey || (me.hasPin && currentPin.length !== PIN_LENGTH)">{{ t('pin.save') }}</UButton>
                    </div>
                  </form>
                  <p v-if="pinEditing" class="text-xs" :class="pinProblemKey ? 'text-error' : 'text-muted'">{{ pinProblemKey ? t('pin.weak') : t('pin.hintNew') }}</p>
                  <UButton v-else color="neutral" variant="outline" icon="i-lucide-key-round" @click="pinEditing = true">{{ t(me.hasPin ? 'me.changePin' : 'me.setPin') }}</UButton>
                  <UButton color="neutral" variant="outline" icon="i-lucide-link" :disabled="!signInLink" @click="copyLink">{{ t('me.copyLink') }}</UButton>
                  <p class="text-xs text-muted">{{ t('me.linkHint') }}</p>
                  <MemberEmail v-if="me.emailEnabled && me.hasPin" />
                  <div v-if="confirmOthers" class="space-y-2">
                    <p class="text-xs text-warning">{{ t('me.signOutOthersConfirm') }}</p>
                    <UInput v-if="me.hasPin" v-model="currentPin" type="password" inputmode="numeric" autocomplete="current-password" :maxlength="PIN_LENGTH" :placeholder="t('pin.current')" :aria-label="t('pin.current')" class="w-full" />
                    <div class="flex gap-2">
                      <UButton color="warning" size="sm" :disabled="me.hasPin && currentPin.length !== PIN_LENGTH" @click="signOutOthers">{{ t('me.signOutOthersDo') }}</UButton>
                      <UButton ref="othersCancel" color="neutral" variant="ghost" size="sm" @click="confirmOthers = false">{{ t('cancel') }}</UButton>
                    </div>
                  </div>
                  <UButton v-else color="neutral" variant="ghost" size="sm" icon="i-lucide-monitor-off" @click="confirmOthers = true">{{ t('me.signOutOthers') }}</UButton>
                  <UButton v-if="me.organizer" color="neutral" variant="ghost" size="sm" icon="i-lucide-users" @click="teamOpen = true">{{ t('team.manage') }}</UButton>
                  <div class="border-t border-default pt-2">
                    <div v-if="confirmSignOut" class="space-y-2">
                      <p class="text-xs text-warning">{{ t(me.hasPin ? 'me.signOutConfirm' : 'me.signOutNoPin') }}</p>
                      <div class="flex gap-2">
                        <UButton color="warning" size="sm" @click="signOut">{{ t('me.signOut') }}</UButton>
                        <UButton color="neutral" variant="ghost" size="sm" @click="confirmSignOut = false">{{ t('cancel') }}</UButton>
                      </div>
                    </div>
                    <UButton v-else color="neutral" variant="ghost" size="sm" icon="i-lucide-log-out" @click="confirmSignOut = true">{{ t('me.signOut') }}</UButton>
                  </div>
                </div>
                <MemberPicker v-else />
              </div>
            </template>
          </UPopover>
          <div class="flex items-center gap-1" :class="collapsed ? 'flex-col' : 'justify-between'">
            <UFieldGroup v-if="!collapsed" size="xs" :aria-label="t('app.language')">
              <UButton
                v-for="l in locales"
                :key="l.code"
                :label="l.code.toUpperCase()"
                :color="locale === l.code ? 'primary' : 'neutral'"
                :variant="locale === l.code ? 'soft' : 'ghost'"
                @click="pick(l.code)"
              />
            </UFieldGroup>
            <div class="flex items-center gap-1" :class="collapsed && 'flex-col'">
              <UTooltip :text="t('settings.title')">
                <UButton icon="i-lucide-palette" color="neutral" variant="ghost" size="sm" :aria-label="t('settings.title')" @click="settingsOpen = true" />
              </UTooltip>
              <UTooltip :text="t('app.colorMode')">
                <UColorModeButton size="sm" />
              </UTooltip>
            </div>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />

    <UModal v-model:open="teamOpen" :title="t('team.manage')" :description="t('team.hint')">
      <template #body>
        <UAlert v-if="resetResult" class="mb-3" color="success" variant="subtle" :title="t('pin.resetDone', resetResult)" />
        <ul class="divide-y divide-default">
          <li v-for="m in members.filter((x) => x.id !== me?.id)" :key="m.id" class="flex items-center gap-3 py-2">
            <MemberAvatar :id="m.id" :name="m.name" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ m.name }}</span>
            <UButton color="neutral" variant="outline" size="xs" icon="i-lucide-key-round" :loading="resetting === m.id" :aria-label="t('pin.resetFor', { name: m.name })" @click="resetPin(m)">{{ t('pin.reset') }}</UButton>
            <UButton color="neutral" variant="outline" size="xs" icon="i-lucide-archive" :loading="archiving === m.id" :aria-label="t('team.archiveName', { name: m.name })" @click="archive(m.id)">{{ t('team.archive') }}</UButton>
          </li>
        </ul>
      </template>
    </UModal>

    <UModal v-model:open="settingsOpen" :title="t('settings.title')" :description="t('settings.description')" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <UFormField :label="t('settings.mainStyle')" :hint="t('settings.mainStyleHint')">
          <ThemePicker v-model="appTheme" />
        </UFormField>
      </template>
    </UModal>
  </UDashboardGroup>
</template>
