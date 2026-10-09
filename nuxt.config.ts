export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Team Events',
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [{ property: 'og:image', content: '/icon-512.png' }],
    },
  },
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'vi',
    // Vietnamese unless the visitor picked English (app.vue keeps the pick in a cookie).
    detectBrowserLanguage: false,
    locales: [
      { code: 'vi', name: 'Tiếng Việt', file: 'vi.json' },
      { code: 'en', name: 'English', file: 'en.json' },
    ],
  },
});
