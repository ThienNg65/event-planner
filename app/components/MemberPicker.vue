<script setup lang="ts">
// `newOnly`: other people's names are not listed (the create page) until "Already have a name?" is tapped.
// `pickOnly`: only the list, for returning voters once voting has closed.
// `autofocus`: for the join sheet; inline pickers must not pop the phone keyboard.
const props = defineProps<{ newOnly?: boolean; pickOnly?: boolean; autofocus?: boolean }>();
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();
const toast = useToast();
const { members, refresh, refreshMe } = useMe();

type Row = (typeof members.value)[number];
const adding = ref(false);
const revealed = ref(false);
const picked = ref<Row | null>(null);
const newName = ref('');
const pin = ref('');
const busy = ref(false);
// Names you can sign into: one with a PIN, or one nobody has taken yet (whoever picks it first sets its PIN).
// A name someone signed in as before PINs existed needs their sign-in link or an organizer's PIN reset.
const pickable = computed(() => members.value.filter((m) => m.hasPin || !m.claimed));
const listed = computed(() => (props.newOnly && !revealed.value ? [] : pickable.value));
// What is typed in the name box: an existing name (ignoring case and accents) is never offered as "Add".
const term = ref('');
const exact = computed(() => {
  const n = norm(term.value);
  return n ? members.value.find((m) => norm(m.name) === n) : undefined;
});
const hiddenMatch = computed(() => (exact.value && !listed.value.some((m) => m.id === exact.value!.id) ? exact.value : undefined));
const lookalike = computed(() => {
  const n = norm(newName.value);
  return n ? members.value.find((m) => norm(m.name) === n) : undefined;
});
// Setting a PIN (new name or an unclaimed one) is held to the strength rules; entering an existing PIN is not.
const setting = computed(() => !!adding.value || (!!picked.value && !picked.value.hasPin));
const weak = computed(() => setting.value && pin.value.length === PIN_LENGTH && pinProblem(pin.value) === 'weak');
const ready = computed(() => pin.value.length === PIN_LENGTH && !weak.value && (!adding.value || !!newName.value.trim()));
watch(pin, (v) => {
  pin.value = v.replace(/\D/g, '');
  // The sixth digit signs in; the button stays for keyboards and screen readers.
  // A lookalike warning is still open: wait for the button.
  if (pin.value.length === PIN_LENGTH && ready.value && !busy.value && !recover.value && !(adding.value && lookalike.value)) submit();
});

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
    emit('done');
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
  adding.value = false;
  picked.value = null;
  newName.value = '';
  term.value = '';
  pin.value = '';
}
function startAdd(name: string) {
  newName.value = name.trim();
  picked.value = null;
  adding.value = true;
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
    emit('done');
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
      <UInputMenu
        v-else
        :items="listed"
        label-key="name"
        v-model:search-term="term"
        :create-item="pickOnly || exact ? false : 'always'"
        :placeholder="t('me.yourName')"
        :autofocus="autofocus"
        :aria-label="t('me.yourName')"
        :maxlength="50"
        class="w-full"
        @update:model-value="(m: Row) => m && pickMember(m)"
        @create="startAdd"
      >
        <template #create-item-label="{ item }">{{ t('join.add', { name: item }) }}</template>
      </UInputMenu>
      <p v-if="hiddenMatch" class="text-xs text-warning">{{ t(pickable.some((m) => m.id === hiddenMatch!.id) ? 'me.isThisYou' : 'me.claimedName', { name: hiddenMatch.name }) }}</p>
      <UButton v-if="newOnly && !revealed" variant="link" size="xs" class="px-0" @click="revealed = true">{{ t('me.otherDeviceNew') }}</UButton>
    </div>

    <form v-else-if="recover !== 'code'" class="space-y-2" @submit.prevent="submit">
      <p class="text-sm font-medium">{{ picked ? t(picked.hasPin ? 'join.pinEnter' : 'pin.chooseFor', { name: picked.name }) : t('join.pinNew', { name: newName }) }}</p>
      <div class="flex gap-2">
        <UInput
          v-model="pin"
          type="password"
          inputmode="numeric"
          :autocomplete="setting ? 'new-password' : 'current-password'"
          :maxlength="PIN_LENGTH"
          :placeholder="t(setting ? 'pin.choose' : 'pin.enter')"
          autofocus
          :aria-label="t('pin.label')"
          class="flex-1"
        />
        <UButton type="submit" :loading="busy" :disabled="!ready">{{ t(picked ? 'pin.go' : 'me.join') }}</UButton>
        <UButton variant="ghost" color="neutral" @click="reset">{{ t('cancel') }}</UButton>
      </div>
      <p v-if="weak || setting" class="text-xs" :class="weak ? 'text-error' : 'text-muted'">{{ weak ? t('pin.weak') : t('join.pinWhy') }}</p>
      <template v-if="adding">
        <UAlert
          v-if="lookalike && (lookalike.hasPin || !lookalike.claimed)"
          color="warning"
          variant="subtle"
          :title="t('me.isThisYou', { name: lookalike.name })"
          :actions="[{ label: t('me.thatsMe'), onClick: () => pickMember(lookalike!) }]"
        />
        <UAlert v-else-if="lookalike" color="warning" variant="subtle" :title="t('me.claimedName', { name: lookalike.name })" />
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
