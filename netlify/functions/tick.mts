// Netlify scheduled function: calls the tick endpoint of the deployed site.
export default async () => {
  const res = await fetch(`${process.env.APP_URL}/api/cron/tick`, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  });
  if (!res.ok) throw new Error(`tick failed: ${res.status}`);
};

export const config = { schedule: '@hourly' };
