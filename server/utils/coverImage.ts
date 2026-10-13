import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** True for addresses a public cover must never resolve to: loopback, private, link-local (cloud metadata), unspecified. */
function isPrivate(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb');
}

/**
 * Fetches a cover picture for the share card and returns it as a data: URI, or null when it is not safe or not an image.
 * The URL is user-supplied, so: http(s) only, every resolved address must be public, no redirects, 3 s, 4 MB, image types only.
 * (A DNS answer can change between this check and the fetch; the worst case is a one-off request from the server whose reply is never shown.)
 */
export async function fetchCoverImage(raw: string): Promise<string | null> {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return null;
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return null;

    const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(3000), headers: { accept: TYPES.join(',') } });
    const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!res.ok || !TYPES.includes(type) || !res.body) return null;
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > MAX_BYTES) return null;
      chunks.push(chunk);
    }
    return `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
  } catch {
    return null;
  }
}
