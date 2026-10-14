<script setup lang="ts">
// vi/en switch for a message that will be copied out of the app: its language is independent of the app's.
const lang = defineModel<'vi' | 'en'>({ required: true });
const { t, loadLocaleMessages } = useI18n();
// Locales load lazily and there is no fallback locale: the other language's strings must be in before the message is built.
watch(lang, (l) => loadLocaleMessages(l), { immediate: true });
</script>

<template>
  <UFieldGroup size="xs" role="group" :aria-label="t('share.messageLang')">
    <UButton v-for="l in ['vi', 'en'] as const" :key="l" :label="l.toUpperCase()" :color="lang === l ? 'primary' : 'neutral'" :variant="lang === l ? 'soft' : 'outline'" :aria-pressed="lang === l" @click="lang = l" />
  </UFieldGroup>
</template>
