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
watch(whoOpen, async (o) => {
  if (!o || !me.value || signInLink.value) return;
  try {
    const { token } = await $fetch('/api/me/link', { method: 'POST' });
    signInLink.value = `${location.origin}/#signin=${token}`;
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
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

// A claimed name can't be picked again, so signing out asks first: the sign-in link is the only way back.
const confirmSignOut = ref(false);
watch(whoOpen, () => (confirmSignOut.value = false));
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
                  <UButton color="neutral" variant="outline" icon="i-lucide-link" :disabled="!signInLink" @click="copyLink">{{ t('me.copyLink') }}</UButton>
                  <p class="text-xs text-muted">{{ t('me.linkHint') }}</p>
                  <UButton v-if="me.organizer" color="neutral" variant="ghost" size="sm" icon="i-lucide-users" @click="teamOpen = true">{{ t('team.manage') }}</UButton>
                  <div class="border-t border-default pt-2">
                    <div v-if="confirmSignOut" class="space-y-2">
                      <p class="text-xs text-warning">{{ t('me.signOutConfirm') }}</p>
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
        <ul class="divide-y divide-default">
          <li v-for="m in members.filter((x) => x.id !== me?.id)" :key="m.id" class="flex items-center gap-3 py-2">
            <MemberAvatar :id="m.id" :name="m.name" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ m.name }}</span>
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
