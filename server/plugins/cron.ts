// Cloudflare Workers: the cron trigger in nuxt.config.ts lands here. Nitro keeps the Worker alive until the returned promise settles.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('cloudflare:scheduled', async ({ controller }) => {
    await runTick(new Date(controller.scheduledTime));
  });
});
