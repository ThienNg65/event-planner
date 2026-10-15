<script setup lang="ts">
const { t } = useI18n();
const toast = useToast();
const { me } = useMe();
const { open, newOnly, done, cancel } = useJoin();
const renameRequest = useState<boolean>('renameRequest', () => false);
watch(open, (o) => !o && cancel());

// A bottom sheet on phones (the keyboard pushes it up instead of covering the PIN), a dialog elsewhere.
const phone = ref(false);
onMounted(() => {
  const q = window.matchMedia('(max-width: 639px)');
  phone.value = q.matches;
  q.onchange = (e) => (phone.value = e.matches);
});
const sheets = { phone: resolveComponent('UDrawer'), wide: resolveComponent('UModal') };
const Shell = computed(() => (phone.value ? sheets.phone : sheets.wide));

// Once, right after signing in: say who you are and where to rename.
async function onDone() {
  const name = me.value?.name;
  await done();
  if (name) toast.add({ title: t('me.youAre', { name }), actions: [{ label: t('me.rename'), color: 'neutral', variant: 'outline', onClick: () => (renameRequest.value = true) }] });
}
</script>

<template>
  <component :is="Shell" v-model:open="open" :title="t('join.title')" :description="t('join.pinWhy')" :ui="{ description: 'sr-only' }">
    <template #body>
      <MemberPicker :new-only="newOnly" autofocus @done="onDone" />
    </template>
  </component>
</template>
