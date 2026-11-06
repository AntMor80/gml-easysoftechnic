import { closeRing } from '../geometry.js';
import type { Point, Ring } from '../types.js';

/**
 * Lee coordenadas pegadas desde el comando LIST de AutoCAD o desde un TXT.
 * - LIST: líneas tipo "en el punto  X=  442345.1200  Y=4473211.3400  Z=  0.0000"
 *   (o "at point X=... Y=..."); cada bloque "LWPOLYLINE"/"POLILÍNEA" es un recinto.
 * - TXT: un par "x y" o "x;y" o "x,y" por línea; la palabra "separador" separa recintos.
 * Devuelve un anillo cerrado por recinto.
 */
export function parseCoordinateText(input: string): Ring[] {
  const rings: Point[][] = [];
  let current: Point[] = [];
  const flush = () => {
    if (current.length >= 3) rings.push(current);
    current = [];
  };
  const lines = input.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^separador$/i.test(line) || /\b(LWPOLYLINE|POLYLINE|POLIL[IÍ]NEA)\b/i.test(line)) {
      flush();
      continue;
    }
    const xy = line.match(/X\s*=\s*(-?\d+(?:[.,]\d+)?)\s+Y\s*=\s*(-?\d+(?:[.,]\d+)?)/i);
    if (xy) {
      current.push([num(xy[1]!), num(xy[2]!)]);
      continue;
    }
    const pair = line.match(/^(?:\S+[\s;\t]+)?(-?\d+(?:\.\d+)?)[\s;,\t]+(-?\d+(?:\.\d+)?)(?:[\s;,\t]+-?\d+(?:\.\d+)?)?$/);
    if (pair) current.push([Number(pair[1]), Number(pair[2])]);
  }
  flush();
  return rings.map((r) => closeRing(r, 0.001));
}

function num(s: string): number {
  return Number(s.replace(',', '.'));
}

/** Exporta anillos a TXT con el formato que acepta la propia aplicación. */
export function ringsToText(rings: Ring[], decimals = 2): string {
  return rings
    .map((r) => r.map(([x, y]) => `${x.toFixed(decimals)} ${y.toFixed(decimals)}`).join('\n'))
    .join('\nseparador\n');
}
