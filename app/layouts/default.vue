<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui';

const { t, locale, locales, setLocale } = useI18n();
const lang = useCookie<typeof locale.value>('lang', { maxAge: 60 * 60 * 24 * 365 });
const { me, meId } = useMe();
const whoOpen = ref(false);
watch(meId, () => (whoOpen.value = false));

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
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold text-highlighted">
          <img src="/favicon.png" alt="" class="size-8 shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ t('app.name') }}</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu :collapsed="collapsed" :items="nav" orientation="vertical" tooltip />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-2">
          <UPopover v-model:open="whoOpen" :content="{ side: 'top', align: 'start' }">
            <UButton color="neutral" variant="ghost" block class="justify-start gap-2 px-1.5" :aria-label="t('me.label')">
              <UAvatar :alt="me?.name" :icon="me ? undefined : 'i-lucide-user-round'" size="sm" />
              <span v-if="!collapsed" class="min-w-0 text-left">
                <span class="block truncate font-medium text-highlighted">{{ me?.name ?? t('me.label') }}</span>
                <span class="block truncate text-xs font-normal text-muted">{{ me ? t('me.switch') : t('me.pick') }}</span>
              </span>
            </UButton>
            <template #content>
              <div class="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3">
                <p class="text-sm font-semibold text-highlighted">{{ t('me.label') }}</p>
                <MemberPicker />
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
            <UColorModeButton size="sm" />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
