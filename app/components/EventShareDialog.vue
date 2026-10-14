<script setup lang="ts">
import { renderSVG } from 'uqr';

// Share dialog: a ready-to-paste message (vi or en), a QR code (always black on white so any phone camera reads it, whatever the theme), the link, and the system share sheet.
const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ event: EventDetail['event'] }>();
const { t } = useI18n();
const toast = useToast();

// The joining link (`?join=` lets people into a private event), never a manage key. `&s=<stage>` makes each stage a new URL, so chat apps refresh a stale link preview.
const url = computed(() => (import.meta.client ? `${location.origin}/e/${props.event.id}?join=${props.event.joinKey}&s=${props.event.stage}` : ''));
// The QR is generated here from our own URL; there is no user-supplied markup in it.
const qr = computed(() => (url.value ? renderSVG(url.value, { border: 2, ecc: 'M', whiteColor: '#ffffff', blackColor: '#111111' }) : ''));
const canShare = import.meta.client && typeof navigator.share === 'function';

const lang = ref<'vi' | 'en'>('vi');
const message = computed(() => (url.value ? shareMessage((key, params) => t(key, params ?? {}, { locale: lang.value }), lang.value, props.event, url.value) : ''));

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: done });
  } catch {
    toast.add({ color: 'error', title: t('share.copyFailed') });
  }
}
async function nativeShare() {
  try {
    await navigator.share({ title: props.event.title, text: message.value });
  } catch {
    /* share sheet dismissed */
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('share.dialogTitle')" :description="t('share.dialogHint')">
    <template #body>
      <div class="flex flex-col items-center gap-4">
        <div class="w-full space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-muted">{{ t('share.previewLabel') }}</span>
            <MessageLangToggle v-model="lang" />
          </div>
          <pre class="max-h-40 overflow-y-auto rounded-lg bg-elevated/50 p-3 font-sans text-sm break-words whitespace-pre-wrap" role="region" tabindex="0" :aria-label="t('share.previewLabel')">{{ message }}</pre>
          <UButton block icon="i-lucide-message-square-text" :label="t('share.copyMessage')" @click="copy(message, t('share.messageCopied'))" />
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="w-56 max-w-full overflow-hidden rounded-lg bg-white p-1 ring ring-default [&>svg]:block [&>svg]:size-full" role="img" :aria-label="t('share.qrAlt')" v-html="qr" />
        <div class="flex w-full gap-2">
          <UInput :model-value="url" readonly class="min-w-0 flex-1" :aria-label="t('share.link')" @focus="($event.target as HTMLInputElement).select()" />
          <UButton icon="i-lucide-copy" color="neutral" variant="outline" :label="t('share.copy')" @click="copy(url, t('event.linkCopied'))" />
        </div>
        <UButton v-if="canShare" block color="neutral" variant="outline" icon="i-lucide-share" :label="t('share.native')" @click="nativeShare" />
      </div>
    </template>
  </UModal>
</template>
