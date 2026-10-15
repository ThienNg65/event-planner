<script setup lang="ts">
// Organizer-only: who still has to vote, answer or pay, and a message to paste into the group chat.
const props = defineProps<{ data: EventDetail }>();
const { t } = useI18n();
const toast = useToast();

const ev = computed(() => props.data.event);
// Only people who joined the event are reminded (the same "no reply yet" roster the page shows), not the whole team.
const reminder = computed(() => reminderOf(ev.value.stage, props.data.participants, props.data.responses, props.data.confirmed, props.data.share, props.data.held));
const done = computed(() => !!reminder.value && !reminder.value.names.length && !reminder.value.confirm.length);

// One line until opened: "5 still to answer · Remind".
const expanded = ref(false);
const pendingCount = computed(() => (reminder.value ? reminder.value.names.length + reminder.value.confirm.length : 0));
// "Everyone has voted" is already said by the organizer's next-step card, so the poll row stays away once it is true.
const redundant = computed(() => done.value && reminder.value?.kind === 'poll');
const lang = ref<'vi' | 'en'>('vi');
const countOnly = ref(false);
const url = computed(() => (import.meta.client ? `${location.origin}/e/${ev.value.id}?join=${ev.value.joinKey}&s=${ev.value.stage}` : ''));
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
  <UButton v-if="reminder && !redundant && !expanded" color="neutral" variant="outline" block class="justify-between" icon="i-lucide-bell-ring" trailing-icon="i-lucide-chevron-down" @click="expanded = true">
    {{ done ? t(reminder.kind === 'poll' ? 'remind.allVoted' : reminder.kind === 'rsvp' ? 'remind.allAnswered' : 'remind.allPaid') : t('remind.collapsed', { n: pendingCount }) }}
  </UButton>
  <UCard v-else-if="reminder && !redundant" :ui="{ body: 'space-y-3' }">
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
