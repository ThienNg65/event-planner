/** Calls `fill` with the place name of a Google Maps link as soon as one is pasted (short links are resolved by the server). */
export function usePlaceName(link: () => string, fill: (name: string) => void) {
  watch(link, async (url) => {
    let name = placeName(url);
    if (!name && url.startsWith('https://maps.app.goo.gl/')) name = (await $fetch('/api/place-name', { query: { url } }).catch(() => null))?.name ?? null;
    if (name && url === link()) fill(name);
  });
}
