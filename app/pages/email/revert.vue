<script setup lang="ts">
// The "not me" link in an address-change mail opens here. Opening it changes nothing: the button does (a mail scanner
// that follows links can't trigger it). The signed token stays in the #fragment, out of server logs.
const { t } = useI18n();
const toast = useToast();
const token = ref('');
const done = ref(false);
const busy = ref(false);
onMounted(() => {
  token.value = new URLSearchParams(location.hash.slice(1)).get('t') ?? '';
});
async function revert() {
  busy.value = true;
  try {
    await $fetch('/api/me/email/revert', { method: 'POST', body: { token: token.value } });
    history.replaceState(history.state, '', location.pathname);
    done.value = true;
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UDashboardPanel id="email-revert">
    <template #body>
      <div class="mx-auto w-full max-w-md space-y-3 py-8">
        <h1 class="text-xl font-semibold text-highlighted">{{ t('email.revertTitle') }}</h1>
        <UAlert v-if="done" color="success" variant="subtle" :description="t('email.revertDone')" />
        <template v-else>
          <p class="text-sm">{{ t('email.revertBody') }}</p>
          <p v-if="!token" class="text-sm text-warning">{{ t('email.revertMissing') }}</p>
          <UButton color="warning" icon="i-lucide-undo-2" :loading="busy" :disabled="!token" @click="revert">{{ t('email.revertDo') }}</UButton>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
