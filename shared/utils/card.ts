import { encode } from 'uqr';

export const CARD_W = 1200;
export const CARD_H = 630;

export type CardBackground = { stops: [string, string, string] } | { image: string };

/**
 * The share card (Open Graph image) as SVG: the event's cover, with the QR code of its link on a white tile in the middle.
 * The centre stays clear of anything else so it survives the square crop some apps apply. `image` is a data: URI.
 */
export function cardSvg(url: string, bg: CardBackground): string {
  const qr = encode(url, { ecc: 'M', border: 0 });
  const tile = 460;
  const pad = 40;
  const mod = Math.floor((tile - pad * 2) / qr.size);
  const side = mod * qr.size;
  const x0 = (CARD_W - tile) / 2;
  const y0 = (CARD_H - tile) / 2;
  const qx = Math.round(x0 + (tile - side) / 2);
  const qy = Math.round(y0 + (tile - side) / 2);

  let path = '';
  qr.data.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) path += `M${qx + c * mod} ${qy + r * mod}h${mod}v${mod}h-${mod}z`;
    })
  );

  const back =
    'image' in bg
      ? `<image href="${bg.image}" width="${CARD_W}" height="${CARD_H}" preserveAspectRatio="xMidYMid slice"/><rect width="${CARD_W}" height="${CARD_H}" fill="#000" fill-opacity="0.28"/>`
      : `<rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/><circle cx="1040" cy="120" r="260" fill="#fff" fill-opacity="0.14"/><circle cx="140" cy="560" r="220" fill="#000" fill-opacity="0.1"/>`;
  const defs =
    'stops' in bg
      ? `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg.stops[0]}"/><stop offset="0.5" stop-color="${bg.stops[1]}"/><stop offset="1" stop-color="${bg.stops[2]}"/></linearGradient>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}"><defs>${defs}</defs>${back}<rect x="${x0 + 6}" y="${y0 + 14}" width="${tile}" height="${tile}" rx="32" fill="#000" fill-opacity="0.22"/><rect x="${x0}" y="${y0}" width="${tile}" height="${tile}" rx="32" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
}
