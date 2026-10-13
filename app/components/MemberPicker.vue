<script setup lang="ts">
const { t } = useI18n();
const toast = useToast();
const { meId, members, refresh } = useMe();

const adding = ref(false);
const newName = ref('');
const busy = ref(false);
const lookalike = computed(() => {
  const n = norm(newName.value);
  return n ? members.value.find((m) => norm(m.name) === n) : undefined;
});

function pick(id: number) {
  meId.value = id;
  adding.value = false;
  newName.value = '';
}

async function add() {
  busy.value = true;
  try {
    const m = await $fetch<Member>('/api/members', { method: 'POST', body: { name: newName.value } });
    await refresh();
    pick(m.id);
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="!adding" class="flex gap-2">
      <USelectMenu
        :model-value="meId ?? undefined"
        :items="members"
        value-key="id"
        label-key="name"
        :placeholder="t('me.pick')"
        :search-input="{ placeholder: t('me.search') }"
        class="flex-1"
        @update:model-value="meId = $event ?? null"
      />
      <UButton variant="soft" icon="i-lucide-user-plus" @click="adding = true">{{ t('me.new') }}</UButton>
    </div>

    <form v-else class="space-y-2" @submit.prevent="add">
      <div class="flex gap-2">
        <UInput v-model="newName" :placeholder="t('me.yourName')" :maxlength="50" autofocus class="flex-1" />
        <UButton type="submit" :loading="busy" :disabled="!newName.trim()">{{ t('me.join') }}</UButton>
        <UButton variant="ghost" color="neutral" @click="adding = false">{{ t('cancel') }}</UButton>
      </div>
      <UAlert
        v-if="lookalike"
        color="warning"
        variant="subtle"
        :title="t('me.isThisYou', { name: lookalike.name })"
        :actions="[{ label: t('me.thatsMe'), onClick: () => pick(lookalike!.id) }]"
      />
    </form>
  </div>
</template>
