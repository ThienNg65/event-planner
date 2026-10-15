<script setup lang="ts">
// The email section of the account menu: add or change the address (consent, PIN, then a mailed code) or remove it, and
// switch each kind of event email on or off.
// Rendered only when the server reports email as enabled and the member has a PIN.
const { t, locale } = useI18n();
const toast = useToast();
const { me, refreshMe } = useMe();

const step = ref<'idle' | 'form' | 'code' | 'remove'>('idle');
const email = ref('');
const consent = ref(false);
const pin = ref('');
const code = ref('');
const busy = ref(false);
watch(pin, (v) => (pin.value = v.replace(/\D/g, '')));
watch(code, (v) => (code.value = v.replace(/\D/g, '')));

function close() {
  step.value = 'idle';
  email.value = '';
  consent.value = false;
  pin.value = '';
  code.value = '';
}

async function run(action: () => Promise<void>) {
  busy.value = true;
  try {
    await action();
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    busy.value = false;
  }
}
const send = () =>
  run(async () => {
    await $fetch('/api/me/email', { method: 'POST', body: { email: email.value, consent: consent.value, currentPin: pin.value, locale: locale.value } });
    pin.value = '';
    step.value = 'code';
  });
const verify = () =>
  run(async () => {
    await $fetch('/api/me/email/verify', { method: 'POST', body: { code: code.value, locale: locale.value } });
    close();
    await refreshMe();
    toast.add({ title: t('email.saved') });
  });
const setMuted = (kind: NotifyKind, muted: boolean) =>
  run(async () => {
    await $fetch('/api/me/email/mute', { method: 'POST', body: { kind, muted } });
    await refreshMe();
  });
const remove = () =>
  run(async () => {
    await $fetch('/api/me/email', { method: 'DELETE', body: { currentPin: pin.value } });
    close();
    await refreshMe();
    toast.add({ title: t('email.removed') });
  });
</script>

<template>
  <div class="space-y-2 border-t border-default pt-2">
    <p class="text-sm font-semibold text-highlighted">{{ t('email.title') }}</p>
    <template v-if="step === 'idle'">
      <p v-if="me?.email" class="break-all text-sm">{{ t('email.current', { email: me.email.address }) }}</p>
      <p v-else class="text-xs text-muted">{{ t('email.intro') }}</p>
      <p v-if="me?.email?.cooldownUntil" class="text-xs text-warning">{{ t('email.cooldown', { until: fmtDateTime(me.email.cooldownUntil, locale) }) }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-mail" @click="step = 'form'">{{ t(me?.email ? 'email.change' : 'email.add') }}</UButton>
        <UButton v-if="me?.email" color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" @click="step = 'remove'">{{ t('email.remove') }}</UButton>
      </div>
      <div v-if="me?.email" class="space-y-1.5 border-t border-default pt-2">
        <p class="text-xs font-semibold text-highlighted">{{ t('email.notifyTitle') }}</p>
        <p class="text-xs text-muted">{{ t('email.notifyIntro') }}</p>
        <USwitch
          v-for="kind in NOTIFY_KINDS"
          :key="kind"
          size="sm"
          :label="t(`mail.kinds.${kind}`)"
          :model-value="!me.email.muted.includes(kind)"
          :disabled="busy"
          @update:model-value="(on: boolean) => setMuted(kind, !on)"
        />
      </div>
    </template>

    <form v-else-if="step === 'form'" class="space-y-2" @submit.prevent="send">
      <UInput v-model="email" type="email" autocomplete="email" autofocus :placeholder="t('email.label')" :aria-label="t('email.label')" class="w-full" />
      <UCheckbox v-model="consent" :label="t('email.consent')" :ui="{ label: 'text-xs font-normal text-muted' }" />
      <UInput v-model="pin" type="password" inputmode="numeric" autocomplete="current-password" :maxlength="PIN_LENGTH" :placeholder="t('pin.current')" :aria-label="t('pin.current')" class="w-full" />
      <div class="flex gap-2">
        <UButton type="submit" size="sm" :loading="busy" :disabled="!email.trim() || !consent || pin.length !== PIN_LENGTH">{{ t('email.send') }}</UButton>
        <UButton color="neutral" variant="ghost" size="sm" @click="close">{{ t('cancel') }}</UButton>
      </div>
    </form>

    <form v-else-if="step === 'code'" class="space-y-2" @submit.prevent="verify">
      <p class="break-all text-xs text-muted">{{ t('email.codeSent', { email }) }}</p>
      <UInput v-model="code" inputmode="numeric" autocomplete="one-time-code" autofocus :maxlength="6" :placeholder="t('email.code')" :aria-label="t('email.code')" class="w-full" />
      <div class="flex gap-2">
        <UButton type="submit" size="sm" :loading="busy" :disabled="code.length !== 6">{{ t('email.confirm') }}</UButton>
        <UButton color="neutral" variant="ghost" size="sm" @click="close">{{ t('cancel') }}</UButton>
      </div>
    </form>

    <form v-else class="space-y-2" @submit.prevent="remove">
      <p class="text-xs text-warning">{{ t('email.removeNote') }}</p>
      <UInput v-model="pin" type="password" inputmode="numeric" autocomplete="current-password" autofocus :maxlength="PIN_LENGTH" :placeholder="t('pin.current')" :aria-label="t('pin.current')" class="w-full" />
      <div class="flex gap-2">
        <UButton type="submit" color="warning" size="sm" :loading="busy" :disabled="pin.length !== PIN_LENGTH">{{ t('email.remove') }}</UButton>
        <UButton color="neutral" variant="ghost" size="sm" @click="close">{{ t('cancel') }}</UButton>
      </div>
    </form>
  </div>
</template>
