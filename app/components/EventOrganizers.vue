<script setup lang="ts">
const props = defineProps<{ data: EventDetail; role: Role }>();
const emit = defineEmits<{ manage: [] }>();
const { t } = useI18n();
const { meId } = useMe();
const active = computed(() => props.data.cohosts.filter((c) => c.status === 'active'));
// One line per organizer: "Thiên (you) · Host"; older events may have no creator.
const people = computed(() => [
  ...(props.data.hostName ? [{ id: props.data.event.createdBy, name: props.data.hostName, label: t('org.host') }] : []),
  ...active.value.map((c) => ({ id: c.memberId, name: c.name, label: t('org.cohost') })),
]);
// A manage key on a device signed in as someone else: say which role it grants.
const keyRole = computed(() => props.role && !people.value.some((p) => p.id !== null && p.id === meId.value));
</script>

<template>
  <section class="space-y-2 themed-surface p-4" :aria-label="t('org.title')">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-shield-check" class="size-4 text-muted" />{{ t('org.title') }}</h2>
    <p v-for="p in people" :key="p.id ?? 'host'" class="flex items-center gap-2 text-sm">
      <MemberAvatar :id="p.id ?? undefined" :name="p.name" size="xs" />
      <span class="min-w-0 truncate">
        <span class="font-medium text-highlighted">{{ p.name }}</span>
        <span v-if="p.id !== null && p.id === meId" class="text-muted"> ({{ t('org.you') }})</span>
        <span class="text-muted"> · {{ p.label }}</span>
      </span>
    </p>
    <p v-if="data.hasCoHost" class="flex items-center gap-1.5 text-sm text-muted"><UIcon name="i-lucide-link" class="size-4" />{{ t('org.legacyActive') }}</p>
    <p v-if="keyRole" class="text-sm text-muted">{{ t('org.yourRole') }} <span class="font-medium text-highlighted">{{ t(role === 'host' ? 'org.host' : 'org.cohost') }}</span></p>
    <div v-if="role">
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-settings-2" @click="emit('manage')">{{ t('org.manage') }}</UButton>
    </div>
  </section>
</template>
