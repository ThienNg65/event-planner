<script setup lang="ts">
// Organizer-only: who still has to vote, answer or pay, and a message to paste into the group chat.
const props = defineProps<{ data: EventDetail }>();
const { t } = useI18n();
const toast = useToast();
const { members } = useMe();

const ev = computed(() => props.data.event);
const reminder = computed(() => reminderOf(ev.value.stage, members.value, props.data.responses, props.data.confirmed, props.data.share, props.data.held));
const done = computed(() => !!reminder.value && !reminder.value.names.length && !reminder.value.confirm.length);

const lang = ref<'vi' | 'en'>('vi');
const countOnly = ref(false);
const url = computed(() => (import.meta.client ? `${location.origin}/e/${ev.value.id}?s=${ev.value.stage}` : ''));
const message = computed(() =>
  reminder.value && !done.value ? reminderMessage((key, params) => t(key, params ?? {}, { locale: lang.value }), lang.value, ev.value, reminder.value, url.value, countOnly.value) : ''
);

async function copy() {
  try {
    await navigator.clipboard.writeText(message.value);
    toast.add({ title: t('remind.copied') });
  } catch {
    toast.add({ color: 'error', title: t('share.copyFailed') });
  }
}
</script>

<template>
  <UCard v-if="reminder" :ui="{ body: 'space-y-3' }">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="flex items-center gap-1.5 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-bell-ring" class="size-4 text-muted" />{{ t('remind.title') }}</p>
      <MessageLangToggle v-model="lang" />
    </div>
    <p class="text-xs text-muted">{{ t('remind.hint') }}</p>
    <p v-if="done" class="text-sm font-medium text-success">{{ t(reminder.kind === 'poll' ? 'remind.allVoted' : reminder.kind === 'rsvp' ? 'remind.allAnswered' : 'remind.allPaid') }}</p>
    <template v-else>
      <div v-if="reminder.names.length" class="text-sm">
        <p class="text-xs font-medium text-muted">{{ t(`remind.${reminder.kind}`) }} ({{ reminder.names.length }})</p>
        <p>{{ reminder.names.join(', ') }}</p>
      </div>
      <div v-if="reminder.confirm.length" class="text-sm">
        <p class="text-xs font-medium text-muted">{{ t('remind.confirm') }} ({{ reminder.confirm.length }})</p>
        <p>{{ reminder.confirm.join(', ') }}</p>
      </div>
      <div v-if="reminder.kind === 'bill'" class="flex flex-wrap items-center gap-2">
        <UFieldGroup size="xs">
          <UButton :label="t('remind.names')" :color="countOnly ? 'neutral' : 'primary'" :variant="countOnly ? 'outline' : 'soft'" :aria-pressed="!countOnly" @click="countOnly = false" />
          <UButton :label="t('remind.count')" :color="countOnly ? 'primary' : 'neutral'" :variant="countOnly ? 'soft' : 'outline'" :aria-pressed="countOnly" @click="countOnly = true" />
        </UFieldGroup>
        <span class="text-xs text-muted">{{ t('remind.billNote') }}</span>
      </div>
      <pre class="max-h-36 overflow-y-auto rounded-lg bg-elevated/50 p-3 font-sans text-sm break-words whitespace-pre-wrap" role="region" tabindex="0" :aria-label="t('share.previewLabel')">{{ message }}</pre>
      <UButton icon="i-lucide-message-square-text" :label="t('remind.copy')" @click="copy" />
    </template>
  </UCard>
</template>
