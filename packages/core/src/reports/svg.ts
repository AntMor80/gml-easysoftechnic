import { bbox, closeRing } from '../geometry.js';
import type { Point, Polygon } from '../types.js';

export interface PlanLayer {
  polygons: Polygon[];
  stroke: string;
  fill?: string;
  /** Numerar los vértices del exterior. */
  numberVertices?: boolean;
  label?: string;
  /** Puntos a señalar (errores) con un círculo. */
  markers?: Point[];
}

/**
 * Plano en SVG de los recintos, a escala, con norte, escala gráfica y
 * numeración de vértices. Sirve para PDF, Word (como imagen) y pantalla.
 */
export function planSvg(layers: PlanLayer[], width = 500, height = 360): string {
  const pts = layers.flatMap((l) => l.polygons.flatMap((p) => p.exterior));
  if (!pts.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
  const [minx, miny, maxx, maxy] = bbox(pts);
  const pad = 36;
  const s = Math.min((width - 2 * pad) / (maxx - minx || 1), (height - 2 * pad) / (maxy - miny || 1));
  const ox = (width - (maxx - minx) * s) / 2;
  const oy = (height - (maxy - miny) * s) / 2;
  const X = (x: number) => (ox + (x - minx) * s).toFixed(1);
  const Y = (y: number) => (height - oy - (y - miny) * s).toFixed(1);
  const parts: string[] = [];
  layers.forEach((l, li) => {
    for (const p of l.polygons) {
      const d = [p.exterior, ...p.interiors]
        .map((r) => 'M' + closeRing(r).map(([x, y]) => `${X(x)} ${Y(y)}`).join('L') + 'Z')
        .join(' ');
      parts.push(`<path d="${d}" fill="${l.fill ?? 'none'}" fill-rule="evenodd" stroke="${l.stroke}" stroke-width="1.5"/>`);
      if (l.numberVertices) {
        const ring = closeRing(p.exterior).slice(0, -1);
        ring.forEach(([x, y], i) => {
          parts.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="2.5" fill="${l.stroke}"/>`);
          parts.push(`<text x="${Number(X(x)) + 4}" y="${Number(Y(y)) - 4 + li * 11}" font-size="9" font-family="Helvetica" fill="${l.stroke}">${i + 1}</text>`);
        });
      }
    }
  });
  for (const l of layers) {
    for (const [x, y] of l.markers ?? []) {
      parts.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="7" fill="none" stroke="#c0392b" stroke-width="2"/>`);
    }
  }
  // escala gráfica redondeada
  const target = (width / 4) / s;
  const mag = 10 ** Math.floor(Math.log10(target));
  const len = [1, 2, 5, 10].map((k) => k * mag).filter((v) => v <= target).pop() ?? mag;
  const sx = 16, sy = height - 14;
  parts.push(`<line x1="${sx}" y1="${sy}" x2="${(sx + len * s).toFixed(1)}" y2="${sy}" stroke="#222" stroke-width="2"/>`);
  parts.push(`<text x="${sx}" y="${sy - 5}" font-size="9" font-family="Helvetica" fill="#222">${len} m</text>`);
  // norte
  parts.push(`<path d="M${width - 22} 34 L${width - 16} 14 L${width - 10} 34 L${width - 16} 28 Z" fill="#222"/>`);
  parts.push(`<text x="${width - 20}" y="46" font-size="10" font-family="Helvetica" fill="#222">N</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff" stroke="#999"/>${parts.join('')}</svg>`;
}
