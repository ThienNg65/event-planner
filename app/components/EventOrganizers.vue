<script setup lang="ts">
const props = defineProps<{ data: EventDetail; role: Role }>();
const emit = defineEmits<{ manage: [] }>();
const { t } = useI18n();
const active = computed(() => props.data.cohosts.filter((c) => c.status === 'active'));
const roleLabel = computed(() => t(props.role === 'host' ? 'org.host' : props.role === 'cohost' ? 'org.cohost' : 'org.participant'));
</script>

<template>
  <section class="space-y-2 rounded-2xl p-5 shadow-xs ring ring-default" :aria-label="t('org.title')">
    <h2 class="flex items-center gap-2 font-semibold text-highlighted"><UIcon name="i-lucide-shield-check" class="size-5" />{{ t('org.title') }}</h2>
    <p class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-user-round" class="size-4" />{{ t('event.hostedBy', { name: data.hostName }) }}</p>
    <p v-if="active.length" class="flex items-start gap-1.5 text-sm text-muted">
      <UIcon name="i-lucide-users-round" class="mt-0.5 size-4 shrink-0" />{{ t('org.cohostNames', { names: active.map((c) => c.name).join(', ') }) }}
    </p>
    <p v-if="data.hasCoHost" class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-link" class="size-4" />{{ t('org.legacyActive') }}</p>
    <p v-else-if="!active.length" class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-users-round" class="size-4" />{{ t('org.noCohosts') }}</p>
    <p class="text-sm">{{ t('org.yourRole') }} <span class="font-medium">{{ roleLabel }}</span></p>
    <!-- Reserved height: the role is only known in the browser, so the button must not push the page when it appears. -->
    <div class="h-8">
      <UButton v-if="role" size="sm" color="neutral" variant="outline" icon="i-lucide-settings-2" @click="emit('manage')">{{ t('org.manage') }}</UButton>
    </div>
  </section>
</template>
