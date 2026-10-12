<script setup lang="ts">
// Swatches to pick a theme, plus a "Preview" dialog that shows a sample event page in any theme before you commit.
const theme = defineModel<string>({ required: true });
const props = defineProps<{ title?: string; cover?: string | null }>();
const { t } = useI18n();

const open = ref(false);
const looking = ref<ThemeKey>(themeOf(theme.value));
watch(open, (o) => o && (looking.value = themeOf(theme.value)));

const cover = computed(() => coverOf(props.cover ?? null, 0));
const name = computed(() => props.title?.trim() || t('theme.sampleTitle'));

function use() {
  theme.value = looking.value;
  open.value = false;
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t('theme.label')">
      <button
        v-for="key in THEMES"
        :key="key"
        type="button"
        role="radio"
        :aria-checked="theme === key"
        class="flex min-w-24 flex-col items-center gap-1.5 rounded-lg p-2 text-xs font-medium text-default ring ring-default transition focus-visible:outline-2 focus-visible:outline-primary"
        :class="theme === key ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-elevated'"
        @click="theme = key"
      >
        <span class="flex h-9 w-full items-end justify-end rounded-md p-1 ring ring-black/10" :style="{ background: THEME_SWATCH[key][0] }">
          <span class="size-4 rounded-full" :style="{ background: THEME_SWATCH[key][1] }" />
        </span>
        {{ t(`theme.${key}`) }}
      </button>
    </div>
    <UButton type="button" color="neutral" variant="outline" size="sm" icon="i-lucide-eye" :label="t('theme.preview')" @click="open = true" />

    <UModal v-model:open="open" :title="t('theme.preview')" :description="t('theme.previewHint')" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="flex flex-wrap gap-1.5" role="tablist" :aria-label="t('theme.label')">
            <UButton
              v-for="key in THEMES"
              :key="key"
              type="button"
              role="tab"
              size="xs"
              :aria-selected="looking === key"
              :color="looking === key ? 'primary' : 'neutral'"
              :variant="looking === key ? 'solid' : 'outline'"
              :label="t(`theme.${key}`)"
              @click="looking = key"
            />
          </div>

          <!-- A scoped theme: the wallpaper, type and surfaces come from this wrapper, not from <html>. -->
          <div :data-theme="looking" class="themed-preview overflow-hidden rounded-xl ring ring-default">
            <div class="themed-bar flex items-center justify-between gap-2 px-4 py-3">
              <span class="themed-title truncate">{{ t('nav.events') }}</span>
              <UButton size="xs" icon="i-lucide-circle-plus" :label="t('nav.new')" />
            </div>

            <div class="grid items-start gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <!-- The event as it appears in the home list. -->
              <div class="themed-surface flex flex-col overflow-hidden">
                <div class="relative h-24" :class="'gradient' in cover && cover.gradient">
                  <img v-if="'image' in cover" :src="cover.image" alt="" class="size-full object-cover" />
                  <UBadge color="secondary" variant="solid" icon="i-lucide-vote" :label="t('card.vote')" class="absolute top-3 left-3" />
                  <UBadge color="primary" variant="solid" :label="t('stage.poll')" class="absolute top-3 right-3" />
                  <div class="absolute -bottom-6 left-4 grid min-w-12 place-items-center rounded-lg bg-default px-1.5 py-1 shadow-md ring ring-default">
                    <span class="text-[0.625rem] font-semibold text-primary uppercase">Nov</span>
                    <span class="text-lg leading-none font-bold text-highlighted">8</span>
                  </div>
                </div>
                <div class="space-y-1 p-4 pt-8">
                  <p class="truncate font-semibold text-highlighted">{{ name }}</p>
                  <p class="truncate text-sm text-muted">{{ t('theme.sampleMeta') }}</p>
                  <div class="pt-2">
                    <div class="mb-1 flex justify-between text-xs text-muted tabular-nums"><span>{{ t('event.seats') }}</span><span>9/12</span></div>
                    <UProgress :model-value="9" :max="12" size="xs" />
                  </div>
                </div>
              </div>

              <!-- The vote on the event page. -->
              <div class="themed-surface space-y-3 p-4">
                <p class="text-sm font-semibold text-highlighted">{{ t('theme.sampleQuestion') }}</p>
                <div class="grid grid-cols-3 gap-2">
                  <div v-for="(d, i) in [6, 11, 3]" :key="i" class="rounded-lg p-2 text-center ring ring-default" :class="i === 1 && 'bg-primary/10 ring-2 ring-primary'">
                    <p class="text-xs text-muted">{{ ['Fri', 'Sat', 'Sun'][i] }}</p>
                    <p class="text-lg font-semibold text-highlighted">{{ 7 + i }}</p>
                    <p class="text-xs text-muted tabular-nums">{{ d }}</p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton :label="t('theme.sampleVote')" icon="i-lucide-vote" />
                  <UButton color="neutral" variant="outline" :label="t('theme.sampleMaybe')" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="t('theme.close')" @click="open = false" />
          <UButton :label="t('theme.use', { name: t(`theme.${looking}`) })" @click="use" />
        </div>
      </template>
    </UModal>
  </div>
</template>
