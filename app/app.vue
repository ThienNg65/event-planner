<script setup lang="ts">
import { en, vi } from '@nuxt/ui/locale';

const { t, locale, setLocale } = useI18n();
// Nuxt UI's own texts and the calendar follow the app language.
const uiLocales = { en, vi };
const lang = useCookie<typeof locale.value>('lang', { maxAge: 60 * 60 * 24 * 365 });

if (lang.value && lang.value !== locale.value) await setLocale(lang.value);

// The main style (Settings → Appearance). Pages that belong to an event, or preview one, replace it with useEventTheme.
const appTheme = useAppTheme();
// Defaults for link previews of every other page; the event page sets its own.
useSeoMeta({ ogSiteName: () => t('app.name'), ogImage: `${useRequestURL().origin}/icon-512.png`, twitterCard: 'summary' });
useHead({ htmlAttrs: { lang: locale, 'data-theme': appTheme } });
</script>

<template>
  <UApp :locale="uiLocales[locale]">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
