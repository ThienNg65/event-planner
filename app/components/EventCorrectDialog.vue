<script setup lang="ts">
const props = defineProps<{ data: EventDetail; manageKey: string }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();

const ev = computed(() => props.data.event);
const blank = () => ({ startsAt: ev.value.startsAt ? toTeamInput(ev.value.startsAt) : '', venue: ev.value.venue ?? '', venueLink: ev.value.venueLink ?? '' });
const form = ref(blank());
const snapshot = ref(blank());
const notice = ref('');
// Once the organizer writes their own notice, the prefill stops overwriting it.
const noticeTouched = ref(false);
const error = ref('');
const busy = ref(false);
const changes = computed(() => changedFields(snapshot.value, form.value));
const startsAtIso = computed(() => (changes.value.startsAt ? teamTime(...(changes.value.startsAt.split('T') as [string, string])) : ''));

watch(open, (o) => {
  if (!o) return;
  form.value = blank();
  snapshot.value = blank();
  notice.value = '';
  noticeTouched.value = false;
  error.value = '';
});
// Same wording as the Edit panel's update, so the correction reads like any other change.
watch(
  () => [startsAtIso.value, changes.value.venue],
  () => {
    if (noticeTouched.value) return;
    notice.value = [
      startsAtIso.value && t('notice.moved', { when: fmtDateTime(startsAtIso.value, locale.value) }),
      changes.value.venue && t('notice.venue', { venue: changes.value.venue }),
    ]
      .filter(Boolean)
      .join(' ');
  }
);

async function save() {
  const { startsAt, ...rest } = changes.value;
  busy.value = true;
  error.value = '';
  try {
    await $fetch(`/api/events/${ev.value.id}`, {
      method: 'PATCH',
      body: { correct: true, ...rest, ...(startsAt && { startsAt: startsAtIso.value }), notice: notice.value.trim() },
      headers: { 'x-manage-key': props.manageKey },
    });
  } catch (e) {
    error.value = errMsg(e);
    return;
  } finally {
    busy.value = false;
  }
  open.value = false;
  emit('changed');
}
</script>

<template>
  <UModal v-model:open="open" :title="t('correct.title')" :description="t('correct.body')">
    <template #body>
      <form id="correct-event" class="space-y-4" @submit.prevent="save">
        <UFormField :label="t('manage.schedule')">
          <DateTimeInput v-model="form.startsAt" class="w-full" />
        </UFormField>
        <UFormField :label="t('create.where')">
          <div class="space-y-2">
            <UInput v-model="form.venue" :maxlength="100" :placeholder="t('create.venue')" class="w-full" />
            <UInput v-model="form.venueLink" type="url" :placeholder="t('create.venueLink')" class="w-full" />
          </div>
        </UFormField>
        <UFormField :label="t('correct.notice')" required>
          <UTextarea v-model="notice" :maxlength="280" :rows="2" class="w-full" @input="noticeTouched = true" />
        </UFormField>
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">{{ t('cancel') }}</UButton>
        <UButton type="submit" form="correct-event" :loading="busy" :disabled="!Object.keys(changes).length || !notice.trim()">{{ t('correct.button') }}</UButton>
      </div>
    </template>
  </UModal>
</template>
