<script setup lang="ts">
const props = defineProps<{ data: EventDetail; manageKey: string | null; role: Role }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ changed: []; rekeyed: [key: string] }>();
const { t, locale } = useI18n();
const toast = useToast();
const { me, members } = useMe();
const { busy, call } = useEventApi(
  () => props.data.event.id,
  () => props.manageKey
);

const isHost = computed(() => can(props.role, 'cohost'));
// What each role may do, read from the same table the server uses.
const ROWS: { key: string; action?: Action }[] = [
  { key: 'answer' },
  { key: 'edit', action: 'edit' },
  { key: 'advance', action: 'advance' },
  { key: 'removeVenue', action: 'removeVenue' },
  { key: 'setOthers', action: 'setOthers' },
  { key: 'reopen', action: 'reopen' },
  { key: 'cancel', action: 'cancel' },
  { key: 'cohost', action: 'cohost' },
  { key: 'handover', action: 'handover' },
];
const COLUMNS: { role: Role; label: string }[] = [
  { role: 'host', label: 'org.host' },
  { role: 'cohost', label: 'org.cohost' },
  { role: null, label: 'org.participant' },
];
const allowed = (role: Role, action?: Action) => !action || can(role, action);
const BADGE = { active: 'success', invited: 'warning', expired: 'error' } as const;

// Full screen on phones.
const phone = ref(false);
onMounted(() => {
  const mq = window.matchMedia('(max-width: 639px)');
  phone.value = mq.matches;
  mq.addEventListener('change', (e) => (phone.value = e.matches));
});

const list = computed(() => props.data.cohosts);
const candidates = computed(() => members.value.filter((m) => m.id !== props.data.event.createdBy && !list.value.some((c) => c.memberId === m.id)));
const picked = ref<number | undefined>();
// A co-host can leave only if their own named row exists (a legacy shared link has none).
const myRow = computed(() => (props.role === 'cohost' ? list.value.find((c) => c.memberId === me.value?.id && c.status === 'active') : undefined));

// The invite secret is only shown once (we store its hash), so the link stays on screen until the dialog closes.
// Copying is a separate tap: Safari rejects clipboard writes that follow an await.
const link = ref<{ name: string; url: string } | null>(null);
const confirming = ref<{ kind: 'reissue' | 'revoke' | 'leave' | 'legacy' | 'rotateKey'; memberId?: number } | null>(null);
watch(open, (o) => {
  if (!o) return;
  link.value = null;
  confirming.value = null;
  picked.value = undefined;
});
// A confirm opens with focus on Cancel, never on the destructive button.
const cancelBtn = useTemplateRef<{ $el: HTMLElement }[]>('cancelBtn');
watch(confirming, async (c) => {
  if (!c) return;
  await nextTick();
  cancelBtn.value?.[0]?.$el.focus();
});
const is = (kind: string, memberId?: number) => confirming.value?.kind === kind && confirming.value.memberId === memberId;

const origin = () => `${location.origin}/e/${props.data.event.id}`;
async function copy(text: string, title: string, description?: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title, description });
  } catch {
    /* clipboard blocked: the link is still shown to copy by hand */
  }
}

async function invite(memberId: number, reissue = false) {
  try {
    const { invite: secret } = await $fetch<{ invite: string }>(`/api/events/${props.data.event.id}/cohosts`, {
      method: 'POST',
      headers: props.manageKey ? { 'x-manage-key': props.manageKey } : {},
      body: { memberId, reissue },
    });
    const name = members.value.find((m) => m.id === memberId)?.name ?? '';
    link.value = { name, url: `${origin()}?join=${props.data.event.joinKey}#invite=${secret}` };
    confirming.value = null;
    picked.value = undefined;
    emit('changed');
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
}

async function remove(memberId: number) {
  if (!(await call(`/cohosts/${memberId}`, 'DELETE'))) return;
  confirming.value = null;
  if (link.value) link.value = null;
  emit('changed');
}

// The old manage key dies at once; this browser keeps working because it is handed the new one.
async function rotateKey() {
  try {
    const { key } = await $fetch<{ key: string }>(`/api/events/${props.data.event.id}/key`, {
      method: 'POST',
      headers: props.manageKey ? { 'x-manage-key': props.manageKey } : {},
    });
    saveManageKey(props.data.event.id, key);
    confirming.value = null;
    emit('rekeyed', key);
    toast.add({ title: t('org.rotated'), description: t('org.rotatedHint') });
  } catch (e) {
    toast.add({ color: 'error', title: errMsg(e) });
  }
}

async function revokeLegacy() {
  if (!(await call('/cohost', 'DELETE'))) return;
  confirming.value = null;
  emit('changed');
}
</script>

<template>
  <UModal v-model:open="open" :title="t('org.title')" :description="t('org.description')" :fullscreen="phone">
    <template #body>
      <div class="space-y-6">
        <p class="text-sm">
          {{ t('org.yourRole') }} <UBadge :color="role === 'host' ? 'primary' : 'neutral'" variant="subtle" :label="t(role === 'host' ? 'org.host' : 'org.cohost')" />
        </p>
        <UAlert color="neutral" variant="subtle" icon="i-lucide-info" :description="t('org.trust')" />

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs text-muted">
                <th scope="col" class="py-2 pr-2 font-medium">{{ t('org.can') }}</th>
                <th v-for="c in COLUMNS" :key="c.label" scope="col" class="px-2 py-2 text-center font-medium">{{ t(c.label) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ROWS" :key="r.key" class="border-b border-default/60">
                <th scope="row" class="py-2 pr-2 text-left font-normal">{{ t(`org.rows.${r.key}`) }}</th>
                <td v-for="c in COLUMNS" :key="c.label" class="px-2 py-2 text-center">
                  <template v-if="allowed(c.role, r.action)">
                    <UIcon name="i-lucide-check" class="size-4 text-success" /><span class="sr-only">{{ t('org.yes') }}</span>
                  </template>
                  <template v-else>
                    <UIcon name="i-lucide-minus" class="size-4 text-dimmed" /><span class="sr-only">{{ t('org.no') }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section class="space-y-3 border-t border-default pt-6" :aria-label="t('org.cohosts')">
          <h3 class="text-sm font-semibold">{{ t('org.cohosts') }}</h3>
          <p v-if="!list.length && !data.hasCoHost" class="text-sm text-muted">{{ t('org.noCohosts') }}</p>

          <ul class="space-y-2">
            <li v-for="c in list" :key="c.memberId" class="space-y-2 rounded-lg p-3 ring ring-default">
              <div class="flex flex-wrap items-center gap-2">
                <span class="min-w-0 flex-1 truncate font-medium">{{ c.name }}</span>
                <UBadge :color="BADGE[c.status]" variant="subtle" :label="t(`org.status.${c.status}`)" />
                <span v-if="isHost && c.status !== 'active'" class="text-xs text-muted">{{ fmtDateTime(c.invitedAt, locale) }}</span>
              </div>
              <template v-if="isHost">
                <div v-if="is('reissue', c.memberId) || is('revoke', c.memberId)" class="flex flex-wrap items-center gap-2">
                  <span class="text-sm">{{ t(is('reissue', c.memberId) ? 'org.reissueConfirm' : 'org.revokeConfirm') }}</span>
                  <UButton color="warning" :loading="busy" @click="is('reissue', c.memberId) ? invite(c.memberId, true) : remove(c.memberId)">
                    {{ t(is('reissue', c.memberId) ? 'org.reissue' : 'org.revoke') }}
                  </UButton>
                  <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="confirming = null">{{ t('cancel') }}</UButton>
                </div>
                <div v-else class="flex flex-wrap gap-2">
                  <UButton v-if="c.status === 'active'" size="sm" color="neutral" variant="outline" icon="i-lucide-key-round" @click="confirming = { kind: 'reissue', memberId: c.memberId }">
                    {{ t('org.reissue') }}
                  </UButton>
                  <UButton v-else size="sm" color="neutral" variant="outline" icon="i-lucide-link" @click="invite(c.memberId)">{{ t('org.newInvite') }}</UButton>
                  <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-user-x" @click="confirming = { kind: 'revoke', memberId: c.memberId }">{{ t('org.revoke') }}</UButton>
                </div>
              </template>
              <div v-else-if="myRow?.memberId === c.memberId">
                <div v-if="is('leave', c.memberId)" class="flex flex-wrap items-center gap-2">
                  <span class="text-sm">{{ t('org.leaveConfirm') }}</span>
                  <UButton color="warning" :loading="busy" @click="remove(c.memberId)">{{ t('org.leave') }}</UButton>
                  <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="confirming = null">{{ t('cancel') }}</UButton>
                </div>
                <UButton v-else size="sm" color="neutral" variant="ghost" icon="i-lucide-log-out" @click="confirming = { kind: 'leave', memberId: c.memberId }">{{ t('org.leave') }}</UButton>
              </div>
            </li>
          </ul>

          <div v-if="link" class="space-y-2 rounded-lg bg-elevated/50 p-3">
            <p class="text-sm font-medium">{{ t('org.inviteFor', { name: link.name }) }}</p>
            <div class="flex gap-2">
              <UInput :model-value="link.url" readonly class="min-w-0 flex-1" :aria-label="t('org.inviteFor', { name: link.name })" />
              <UButton color="neutral" variant="outline" icon="i-lucide-copy" :aria-label="t('org.copyInvite')" @click="copy(link.url, t('org.inviteCopied'), t('org.inviteHint'))" />
            </div>
            <p class="text-xs text-muted">{{ t('org.inviteHint') }}</p>
          </div>

          <div v-if="isHost" class="space-y-2">
            <p class="text-sm font-medium">{{ t('org.invite') }}</p>
            <div class="flex gap-2">
              <USelectMenu v-model="picked" :items="candidates" value-key="id" label-key="name" :placeholder="t('org.pick')" class="min-w-0 flex-1" />
              <UButton icon="i-lucide-user-plus" :disabled="picked === undefined" @click="picked !== undefined && invite(picked)">{{ t('org.createInvite') }}</UButton>
            </div>
          </div>

          <div v-if="data.hasCoHost" class="space-y-2 rounded-lg p-3 ring ring-default">
            <p class="text-sm font-medium">{{ t('org.legacy') }}</p>
            <p class="text-xs text-muted">{{ t('org.legacyHint') }}</p>
            <template v-if="isHost">
              <div v-if="is('legacy')" class="flex flex-wrap items-center gap-2">
                <span class="text-sm">{{ t('edit.cohostRotateConfirm') }}</span>
                <UButton color="warning" :loading="busy" @click="revokeLegacy">{{ t('org.revoke') }}</UButton>
                <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="confirming = null">{{ t('cancel') }}</UButton>
              </div>
              <UButton v-else size="sm" color="neutral" variant="ghost" icon="i-lucide-user-x" @click="confirming = { kind: 'legacy' }">{{ t('org.revoke') }}</UButton>
            </template>
          </div>
        </section>

        <div v-if="can(role, 'rotateKey') && manageKey && data.hostKey" class="space-y-2 border-t border-default pt-6">
          <UButton
            v-if="manageKey"
            color="neutral"
            variant="outline"
            icon="i-lucide-key-round"
            @click="copy(`${origin()}#key=${manageKey}`, t('manage.linkCopied'), t('manage.linkHint'))"
          >
            {{ t('manage.copyLink') }}
          </UButton>
          <p v-if="manageKey" class="text-xs text-muted">{{ t('manage.linkHint') }}</p>
          <div v-if="is('rotateKey')" class="flex flex-wrap items-center gap-2">
            <span class="text-sm">{{ t('org.rotateConfirm') }}</span>
            <UButton color="warning" @click="rotateKey">{{ t('org.rotateDo') }}</UButton>
            <UButton ref="cancelBtn" color="neutral" variant="ghost" @click="confirming = null">{{ t('cancel') }}</UButton>
          </div>
          <UButton v-else color="neutral" variant="ghost" size="sm" icon="i-lucide-refresh-cw" @click="confirming = { kind: 'rotateKey' }">{{ t('org.rotateKey') }}</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
