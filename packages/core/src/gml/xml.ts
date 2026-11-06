export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function fmt(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

export function posList(ring: [number, number][], decimals: number): string {
  return ring.map(([x, y]) => `${fmt(x, decimals)} ${fmt(y, decimals)}`).join(' ');
}

/** Fecha y hora local en formato ISO sin zona, como los GML del Catastro. */
export function timeStamp(d = new Date()): string {
  return d.toISOString().slice(0, 19);
}
