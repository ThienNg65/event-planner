<script setup lang="ts">
const props = defineProps<{ name: string; link?: string | null }>();
const { t } = useI18n();
const src = computed(() => mapEmbedUrl(props.name, props.link));
</script>

<template>
  <UPopover v-if="src" :content="{ side: 'bottom', align: 'start' }" :ui="{ content: 'overflow-hidden rounded-xl' }">
    <UButton icon="i-lucide-map" :label="t('map.show')" color="primary" variant="soft" size="xs" class="ml-1 rounded-full align-middle" />
    <template #content>
      <iframe :src="src" :title="t('map.title', { name })" class="block aspect-[4/3] w-[min(22rem,calc(100vw-2rem))] border-0" allowfullscreen />
    </template>
  </UPopover>
</template>
