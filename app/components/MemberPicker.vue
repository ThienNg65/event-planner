<script setup lang="ts">
// `newOnly`: just a name field (the create page), so other people's names are not listed there.
// `pickOnly`: only the list, for returning voters once voting has closed.
const props = defineProps<{ newOnly?: boolean; pickOnly?: boolean }>();
const { t } = useI18n();
const toast = useToast();
const { members, refresh, refreshMe } = useMe();

const adding = ref(props.newOnly);
const newName = ref('');
const busy = ref(false);
// Only names nobody has signed in as yet can be taken over; a claimed name needs that member's sign-in link.
const unclaimed = computed(() => members.value.filter((m) => !m.claimed));
const lookalike = computed(() => {
  const n = norm(newName.value);
  return n ? members.value.find((m) => norm(m.name) === n) : undefined;
});

async function signIn(req: Promise<unknown>) {
  busy.value = true;
  try {
    await req;
    adding.value = props.newOnly;
    newName.value = '';
    await Promise.all([refreshMe(), refresh()]);
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
    // A name someone else just claimed must drop out of the list.
    refresh();
  } finally {
    busy.value = false;
  }
}
const claim = (id: number) => signIn($fetch(`/api/members/${id}/claim`, { method: 'POST' }));
const add = () => signIn($fetch('/api/members', { method: 'POST', body: { name: newName.value } }));
</script>

<template>
  <div class="space-y-2">
    <div v-if="!adding" class="space-y-2">
      <div class="flex gap-2">
        <USelectMenu
          v-if="unclaimed.length"
          :items="unclaimed"
          value-key="id"
          label-key="name"
          :placeholder="t('me.pick')"
          :search-input="{ placeholder: t('me.search') }"
          :disabled="busy"
          class="flex-1"
          @update:model-value="(id: number) => id && claim(id)"
        />
        <UButton v-if="!pickOnly" variant="soft" icon="i-lucide-user-plus" @click="adding = true">{{ t('me.new') }}</UButton>
      </div>
      <p class="text-xs text-muted">{{ t('me.otherDevice') }}</p>
    </div>

    <form v-else class="space-y-2" @submit.prevent="add">
      <div class="flex gap-2">
        <!-- No autofocus on the create page: the field shows on load, and focus there would pop the phone keyboard. -->
        <UInput v-model="newName" :placeholder="t('me.yourName')" :maxlength="50" :autofocus="!newOnly" class="flex-1" />
        <UButton type="submit" :loading="busy" :disabled="!newName.trim()">{{ t(newOnly ? 'me.continue' : 'me.join') }}</UButton>
        <UButton v-if="!newOnly" variant="ghost" color="neutral" @click="adding = false">{{ t('cancel') }}</UButton>
      </div>
      <UAlert
        v-if="lookalike && !lookalike.claimed"
        color="warning"
        variant="subtle"
        :title="t('me.isThisYou', { name: lookalike.name })"
        :actions="[{ label: t('me.thatsMe'), onClick: () => claim(lookalike!.id) }]"
      />
      <UAlert v-else-if="lookalike" color="warning" variant="subtle" :title="t('me.claimedName', { name: lookalike.name })" />
      <p v-if="newOnly" class="text-xs text-muted">{{ t('me.otherDevice') }}</p>
    </form>
  </div>
</template>
