<script setup lang="ts">
import { renderSVG } from 'uqr';

// Share dialog: a QR code (always black on white so any phone camera reads it, whatever the theme), the link, and the system share sheet.
const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ id: number; title: string; stage: string; joinKey: string }>();
const { t } = useI18n();
const toast = useToast();

const url = computed(() => (import.meta.client ? `${location.origin}/e/${props.id}?join=${props.joinKey}` : ''));
// The QR is generated here from our own URL; there is no user-supplied markup in it.
const qr = computed(() => (url.value ? renderSVG(url.value, { border: 2, ecc: 'M', whiteColor: '#ffffff', blackColor: '#111111' }) : ''));
const canShare = import.meta.client && typeof navigator.share === 'function';

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    toast.add({ title: t('event.linkCopied') });
  } catch {
    toast.add({ color: 'error', title: t('share.copyFailed') });
  }
}
async function nativeShare() {
  try {
    await navigator.share({ title: props.title, text: t(`share.${props.stage}`, { title: props.title }), url: url.value });
  } catch {
    /* share sheet dismissed */
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('share.dialogTitle')" :description="t('share.dialogHint')">
    <template #body>
      <div class="flex flex-col items-center gap-4">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="w-56 max-w-full overflow-hidden rounded-lg bg-white p-1 ring ring-default [&>svg]:block [&>svg]:size-full" role="img" :aria-label="t('share.qrAlt')" v-html="qr" />
        <div class="flex w-full gap-2">
          <UInput :model-value="url" readonly class="min-w-0 flex-1" :aria-label="t('share.link')" @focus="($event.target as HTMLInputElement).select()" />
          <UButton icon="i-lucide-copy" color="neutral" variant="outline" :label="t('share.copy')" @click="copy" />
        </div>
        <UButton v-if="canShare" block icon="i-lucide-share" :label="t('share.native')" @click="nativeShare" />
      </div>
    </template>
  </UModal>
</template>
