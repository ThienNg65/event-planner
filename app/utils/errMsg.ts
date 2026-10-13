/** Translated message for a failed $fetch. The server sends codes like "nameTaken" (see i18n `err.*`). */
export const errMsg = (e: unknown) => {
  const { t, te } = useNuxtApp().$i18n;
  const code = (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? '';
  return te(`err.${code}`) ? t(`err.${code}`) : t('err.generic');
};
