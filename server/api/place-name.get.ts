// The place name behind a Google Maps short link, to prefill the venue name. Short links only resolve by following their redirect,
// which the browser can't do (CORS). Only maps.app.goo.gl is ever fetched, so this can't be used to reach other hosts.
export default defineEventHandler(async (event) => {
  const url = String(getQuery(event).url ?? '');
  if (!/^https:\/\/maps\.app\.goo\.gl\/[\w-]+\/?(\?[^#]*)?$/.test(url)) return { name: null };
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
    return { name: placeName(res.headers.get('location')) };
  } catch {
    return { name: null };
  }
});
