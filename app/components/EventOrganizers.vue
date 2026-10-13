<script setup lang="ts">
const props = defineProps<{ data: EventDetail; role: Role }>();
const emit = defineEmits<{ manage: [] }>();
const { t } = useI18n();
const active = computed(() => props.data.cohosts.filter((c) => c.status === 'active'));
const roleLabel = computed(() => t(props.role === 'host' ? 'org.host' : props.role === 'cohost' ? 'org.cohost' : 'org.participant'));
</script>

<template>
  <section class="space-y-2 themed-surface p-4" :aria-label="t('org.title')">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-shield-check" class="size-4 text-muted" />{{ t('org.title') }}</h2>
    <p class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-user-round" class="size-4" />{{ t('event.hostedBy', { name: data.hostName }) }}</p>
    <p v-if="active.length" class="flex items-start gap-1.5 text-sm text-muted">
      <UIcon name="i-lucide-users-round" class="mt-0.5 size-4 shrink-0" />{{ t('org.cohostNames', { names: active.map((c) => c.name).join(', ') }) }}
    </p>
    <p v-if="data.hasCoHost" class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-link" class="size-4" />{{ t('org.legacyActive') }}</p>
    <p v-else-if="!active.length" class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-users-round" class="size-4" />{{ t('org.noCohosts') }}</p>
    <p class="text-sm text-muted">{{ t('org.yourRole') }} <span class="font-medium text-highlighted">{{ roleLabel }}</span></p>
    <div v-if="role">
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-settings-2" @click="emit('manage')">{{ t('org.manage') }}</UButton>
    </div>
  </section>
</template>
