<script setup lang="ts">
// `newOnly`: just a name and PIN (the create page), so other people's names are not listed there.
// `pickOnly`: only the list, for returning voters once voting has closed.
const props = defineProps<{ newOnly?: boolean; pickOnly?: boolean }>();
const { t } = useI18n();
const toast = useToast();
const { members, refresh, refreshMe } = useMe();

type Row = (typeof members.value)[number];
const adding = ref(props.newOnly);
const picked = ref<Row | null>(null);
const newName = ref('');
const pin = ref('');
const busy = ref(false);
// Names you can sign into: one with a PIN, or one nobody has taken yet (whoever picks it first sets its PIN).
// A name someone signed in as before PINs existed needs their sign-in link or an organizer's PIN reset.
const pickable = computed(() => members.value.filter((m) => m.hasPin || !m.claimed));
const lookalike = computed(() => {
  const n = norm(newName.value);
  return n ? members.value.find((m) => norm(m.name) === n) : undefined;
});
// Setting a PIN (new name or an unclaimed one) is held to the strength rules; entering an existing PIN is not.
const setting = computed(() => !!adding.value || (!!picked.value && !picked.value.hasPin));
const weak = computed(() => setting.value && pin.value.length === PIN_LENGTH && pinProblem(pin.value) === 'weak');
const ready = computed(() => pin.value.length === PIN_LENGTH && !weak.value && (!adding.value || !!newName.value.trim()));
watch(pin, (v) => (pin.value = v.replace(/\D/g, '')));

// Forgot the PIN: mail a code to the name's verified email (shown only once email is switched on), then set a new PIN with it.
const { data: mail } = useFetch('/api/email-enabled', { key: 'email-enabled', default: () => ({ enabled: false }) });
const recover = ref<'ask' | 'code' | null>(null);
const code = ref('');
watch(code, (v) => (code.value = v.replace(/\D/g, '')));
const recoverWeak = computed(() => pin.value.length === PIN_LENGTH && pinProblem(pin.value) === 'weak');
async function askCode() {
  busy.value = true;
  try {
    await $fetch(`/api/members/${picked.value!.id}/recover`, { method: 'POST' });
    toast.add({ title: t('email.recoverSent') });
    pin.value = '';
    recover.value = 'code';
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  } finally {
    busy.value = false;
  }
}
async function confirmRecover() {
  busy.value = true;
  try {
    await $fetch(`/api/members/${picked.value!.id}/recover/confirm`, { method: 'POST', body: { code: code.value, newPin: pin.value } });
    reset();
    await Promise.all([refreshMe(), refresh()]);
    toast.add({ title: t('email.recovered') });
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
    pin.value = '';
  } finally {
    busy.value = false;
  }
}

function reset() {
  recover.value = null;
  code.value = '';
  adding.value = props.newOnly;
  picked.value = null;
  newName.value = '';
  pin.value = '';
}
function pickMember(m: Row) {
  recover.value = null;
  picked.value = m;
  adding.value = false;
  pin.value = '';
}

async function submit() {
  busy.value = true;
  const m = picked.value;
  try {
    if (m) await $fetch(`/api/members/${m.id}/${m.hasPin ? 'signin' : 'claim'}`, { method: 'POST', body: { pin: pin.value } });
    else await $fetch('/api/members', { method: 'POST', body: { name: newName.value, pin: pin.value } });
    reset();
    await Promise.all([refreshMe(), refresh()]);
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
    pin.value = '';
    // A name someone else just took must drop out of the list.
    refresh();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="!adding && !picked" class="space-y-2">
      <p v-if="pickOnly && !pickable.length" class="text-sm text-muted">{{ t('me.noneToPick') }}</p>
      <div class="flex gap-2">
        <USelectMenu
          v-if="pickable.length"
          :items="pickable"
          value-key="id"
          label-key="name"
          :placeholder="t('me.pick')"
          :search-input="{ placeholder: t('me.search') }"
          class="flex-1"
          @update:model-value="(id: number) => id && pickMember(pickable.find((m) => m.id === id)!)"
        />
        <UButton v-if="!pickOnly" variant="soft" icon="i-lucide-user-plus" @click="adding = true">{{ t('me.new') }}</UButton>
      </div>
      <p class="text-xs text-muted">{{ t('me.otherDevice') }}</p>
    </div>

    <form v-else-if="recover !== 'code'" class="space-y-2" @submit.prevent="submit">
      <p v-if="picked" class="text-sm">{{ t(picked.hasPin ? 'pin.enterFor' : 'pin.chooseFor', { name: picked.name }) }}</p>
      <!-- No autofocus on the create page: the field shows on load, and focus there would pop the phone keyboard. -->
      <UInput v-else v-model="newName" :placeholder="t('me.yourName')" :maxlength="50" :autofocus="!newOnly" class="w-full" />
      <div class="flex gap-2">
        <UInput
          v-model="pin"
          type="password"
          inputmode="numeric"
          :autocomplete="setting ? 'new-password' : 'current-password'"
          :maxlength="PIN_LENGTH"
          :placeholder="t(setting ? 'pin.choose' : 'pin.enter')"
          :autofocus="!!picked"
          :aria-label="t('pin.label')"
          class="flex-1"
        />
        <UButton type="submit" :loading="busy" :disabled="!ready">{{ t(picked ? 'pin.go' : newOnly ? 'me.continue' : 'me.join') }}</UButton>
        <UButton v-if="!newOnly || picked" variant="ghost" color="neutral" @click="reset">{{ t('cancel') }}</UButton>
      </div>
      <p class="text-xs" :class="weak ? 'text-error' : 'text-muted'">{{ weak ? t('pin.weak') : setting ? t('pin.hintNew') : t('pin.hintEnter') }}</p>
      <template v-if="adding">
        <UAlert
          v-if="lookalike && (lookalike.hasPin || !lookalike.claimed)"
          color="warning"
          variant="subtle"
          :title="t('me.isThisYou', { name: lookalike.name })"
          :actions="[{ label: t('me.thatsMe'), onClick: () => pickMember(lookalike!) }]"
        />
        <UAlert v-else-if="lookalike" color="warning" variant="subtle" :title="t('me.claimedName', { name: lookalike.name })" />
        <p v-if="newOnly" class="text-xs text-muted">{{ t('me.otherDeviceNew') }}</p>
      </template>
    </form>
    <form v-else class="space-y-2" @submit.prevent="confirmRecover">
      <p class="text-xs text-muted">{{ t('email.recoverSent') }}</p>
      <UInput v-model="code" inputmode="numeric" autocomplete="one-time-code" autofocus :maxlength="6" :placeholder="t('email.code')" :aria-label="t('email.code')" class="w-full" />
      <UInput v-model="pin" type="password" inputmode="numeric" autocomplete="new-password" :maxlength="PIN_LENGTH" :placeholder="t('pin.choose')" :aria-label="t('pin.label')" class="w-full" />
      <p class="text-xs" :class="recoverWeak ? 'text-error' : 'text-muted'">{{ recoverWeak ? t('pin.weak') : t('pin.hintNew') }}</p>
      <div class="flex gap-2">
        <UButton type="submit" :loading="busy" :disabled="code.length !== 6 || pin.length !== PIN_LENGTH || recoverWeak">{{ t('email.recoverDo') }}</UButton>
        <UButton variant="ghost" color="neutral" @click="reset">{{ t('cancel') }}</UButton>
      </div>
    </form>
    <div v-if="mail?.enabled && picked?.hasPin && !recover" class="space-y-1">
      <UButton variant="link" size="xs" class="px-0" @click="recover = 'ask'">{{ t('email.forgot') }}</UButton>
    </div>
    <div v-if="recover === 'ask'" class="space-y-2">
      <UButton size="sm" variant="soft" icon="i-lucide-mail" :loading="busy" @click="askCode">{{ t('email.recoverSend') }}</UButton>
      <p class="text-xs text-muted">{{ t('email.recoverNone') }}</p>
    </div>
  </div>
</template>
