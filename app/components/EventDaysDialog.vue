<script setup lang="ts">
const props = defineProps<{ data: EventDetail; manageKey: string | null }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const toast = useToast();

// The event as the server has it right now (re-read on open), so the impact list is never stale.
const base = ref(props.data);
const days = ref<string[]>([]);
const loaded = ref(false);
const confirming = ref(false);
const saving = ref(false);
const error = ref('');

const headers = (): Record<string, string> => (props.manageKey ? { 'x-manage-key': props.manageKey } : {});
async function load() {
  try {
    base.value = await $fetch<EventDetail>(`/api/events/${props.data.event.id}`, { headers: headers() });
  } catch {
    base.value = props.data;
  }
  days.value = [...base.value.event.pollDays];
  loaded.value = true;
}
watch(open, (o) => {
  if (!o) return;
  loaded.value = false;
  confirming.value = false;
  error.value = '';
  load();
});

const current = computed(() => base.value.event.pollDays);
const addDays = computed(() => days.value.filter((d) => !current.value.includes(d)));
const removeDays = computed(() => current.value.filter((d) => !days.value.includes(d)));
const impact = computed(() => dayRemovalImpact(current.value, days.value, base.value.responses));
const lost = computed(() => impact.value.reduce((n, r) => n + r.names.length, 0));
const rows = computed(() =>
  [...new Set([...current.value, ...days.value])].sort().map((day) => ({
    day,
    ...dayParts(day, locale.value),
    removed: !days.value.includes(day),
    added: !current.value.includes(day),
    names: base.value.responses.filter((r) => r.days.includes(day)).map((r) => r.name),
  }))
);
watch(days, () => (error.value = ''));

// The second step opens with focus on Cancel, never on the button that deletes votes.
const cancelBtn = useTemplateRef<{ $el: HTMLElement }>('cancelBtn');

async function save() {
  if (lost.value && !confirming.value) {
    confirming.value = true;
    await nextTick();
    cancelBtn.value?.$el.focus();
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await $fetch(`/api/events/${props.data.event.id}`, { method: 'PATCH', body: { addDays: addDays.value, removeDays: removeDays.value }, headers: headers() });
  } catch (e) {
    // The input stays; the message shows in the dialog. A lost key or a list changed meanwhile also refreshes the page.
    error.value = errMsg(e);
    confirming.value = false;
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 403 || status === 409) emit('changed');
    return;
  } finally {
    saving.value = false;
  }
  toast.add({ title: t('days.saved') });
  open.value = false;
  emit('changed');
}
</script>

<template>
  <UModal v-model:open="open" :title="t('days.title')" :description="t('days.description')">
    <template #body>
      <div v-if="!loaded" class="flex justify-center py-8"><UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" /></div>
      <div v-else-if="confirming" class="space-y-3">
        <UAlert color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="t('days.confirmTitle', { n: lost }, lost)" :description="t('days.confirmBody')" />
        <ul class="space-y-1 text-sm">
          <li v-for="r in impact" :key="r.day">
            <span class="font-medium">{{ dayParts(r.day, locale).weekday }} {{ dayParts(r.day, locale).date }}</span>
            <span class="text-muted">: {{ r.names.join(', ') }}</span>
          </li>
        </ul>
      </div>
      <div v-else class="space-y-4">
        <PollDaysInput v-model="days" />
        <ul class="divide-y divide-default text-sm">
          <li v-for="r in rows" :key="r.day" class="flex flex-wrap items-baseline gap-x-2 py-1.5">
            <span class="font-medium" :class="r.removed && 'line-through text-muted'">{{ r.weekday }} {{ r.date }}</span>
            <UBadge v-if="r.added" size="sm" color="primary" variant="subtle">{{ t('days.new') }}</UBadge>
            <span class="text-muted tabular-nums">{{ t('days.votes', { n: r.names.length }, r.names.length) }}</span>
            <span v-if="r.removed && r.names.length" class="w-full text-xs text-warning">{{ t('days.willLose', { names: r.names.join(', ') }) }}</span>
          </li>
        </ul>
        <p v-if="!days.length" class="text-sm text-muted">{{ t('days.required') }}</p>
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="open = false">{{ t('cancel') }}</UButton>
        <UButton :color="confirming ? 'error' : 'primary'" :loading="saving" :disabled="!loaded || !days.length || (!addDays.length && !removeDays.length)" @click="save">
          {{ confirming ? t('days.confirmSave') : t('days.save') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
