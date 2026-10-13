<script setup lang="ts">
const cover = defineModel<string | null>({ required: true });
const { t } = useI18n();
const url = computed({
  get: () => (cover.value && !isCoverKey(cover.value) ? cover.value : ''),
  set: (v: string) => (cover.value = v.trim() || null),
});
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t('cover.label')">
      <button
        v-for="(cls, key) in COVERS"
        :key="key"
        type="button"
        role="radio"
        :aria-checked="cover === key"
        :aria-label="t('cover.preset', { name: key })"
        class="grid h-10 w-16 place-items-center rounded-lg ring-offset-2 ring-offset-(--ui-bg) transition focus-visible:outline-2 focus-visible:outline-primary"
        :class="[cls, cover === key ? 'ring-2 ring-primary' : 'hover:opacity-80']"
        @click="cover = cover === key ? null : key"
      >
        <UIcon v-if="cover === key" name="i-lucide-check" class="size-5 rounded-full bg-black/40 p-0.5 text-white" />
      </button>
    </div>
    <UInput v-model="url" type="url" icon="i-lucide-image" :placeholder="t('cover.url')" class="w-full" />
  </div>
</template>
