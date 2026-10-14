import { initWasm, Resvg } from '@resvg/resvg-wasm';
// A precompiled module: Cloudflare Workers cannot compile wasm from bytes at runtime.
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm?module';

let ready: Promise<void> | undefined;

/** The share card: the event's cover with its link as a QR code. Used as og:image, so it must never fail loudly. */
export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  // Without the joining key the card reveals nothing, not even the cover.
  if (!sameKey(getQuery(event).j, ev.joinKey)) return sendRedirect(event, '/icon-512.png', 302);
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin;
  const cover = coverOf(ev.cover, ev.id);

  try {
    ready ??= initWasm(resvgWasm).catch((e) => {
      ready = undefined;
      throw e;
    });
    await ready;
    const image = 'image' in cover ? await fetchCoverImage(cover.image) : null;
    const svg = cardSvg(`${origin}/e/${ev.id}?join=${ev.joinKey}`, image ? { image } : { stops: coverStops(ev.cover, ev.id) });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_W }, font: { loadSystemFonts: false } }).render().asPng();
    setHeader(event, 'content-type', 'image/png');
    // The URL carries a cover tag, so it is safe to cache hard; a changed cover is a new URL.
    setHeader(event, 'cache-control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
    return png;
  } catch {
    return sendRedirect(event, '/icon-512.png', 302);
  }
});
