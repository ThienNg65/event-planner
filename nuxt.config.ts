export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxt/ui', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  // The Ticket theme's face. @nuxt/fonts (bundled with Nuxt UI) self-hosts it. `global`: themes name their font through
  // var(--theme-font), which the module does not scan, so it would never be registered otherwise. The weights are listed
  // because it is not a variable font, and the Vietnamese subset carries the stacked diacritics.
  fonts: { families: [{ name: 'Be Vietnam Pro', provider: 'google', global: true, weights: [400, 500, 600, 700], subsets: ['vietnamese', 'latin-ext', 'latin'] }] },
  hooks: {
    // Set here because Nuxt's `nitro` option type lists neither key.
    'nitro:config'(config) {
      // The share card renders with resvg compiled to wasm, which runs on Node (Netlify) and Cloudflare Workers alike.
      Object.assign((config.experimental ??= {}), { wasm: true });
      // Used only by the cloudflare-module preset: emit a wrangler config with nodejs_compat for `wrangler deploy`.
      // The hourly cron trigger runs the scheduled tick (server/plugins/cron.ts).
      Object.assign(config, {
        cloudflare: { deployConfig: true, nodeCompat: true, wrangler: { triggers: { crons: ['0 * * * *'] } } },
      });
    },
  },
  // Email settings. Empty here: set GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_FROM_NAME, APP_URL, NOTIFY_SECRET and ALLOWED_EMAIL_DOMAINS (or the
  // NUXT_* forms) in the host's environment. Without a key the app sends nothing and hides its email features.
  runtimeConfig: { gmailUser: '', gmailAppPassword: '', mailFromName: '', appUrl: '', notifySecret: '', allowedEmailDomains: '', cronSecret: '' },
  app: {
    head: {
      title: 'Team Events',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
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
