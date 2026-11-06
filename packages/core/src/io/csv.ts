import { closeRing, perimeter, polygonArea } from '../geometry.js';
import type { Polygon } from '../types.js';

export interface VertexRow {
  recinto: string;
  anillo: 'exterior' | 'interior';
  vertice: number;
  x: number;
  y: number;
  /** Distancia al vértice siguiente (lado), en metros. */
  lado: number;
}

/** Tabla de vértices de una o varias geometrías (numeración desde 1, sin repetir el de cierre). */
export function vertexTable(items: { id: string; polygons: Polygon[] }[]): VertexRow[] {
  const rows: VertexRow[] = [];
  for (const it of items) {
    it.polygons.forEach((poly, pi) => {
      const recinto = it.polygons.length > 1 ? `${it.id}-${pi + 1}` : it.id;
      [poly.exterior, ...poly.interiors].forEach((ring, ri) => {
        const r = closeRing(ring);
        for (let k = 0; k < r.length - 1; k++) {
          const [x, y] = r[k]!;
          const [x2, y2] = r[k + 1]!;
          rows.push({ recinto, anillo: ri === 0 ? 'exterior' : 'interior', vertice: k + 1, x, y, lado: Math.hypot(x2 - x, y2 - y) });
        }
      });
    });
  }
  return rows;
}

/**
 * CSV de coordenadas con separador ";" y coma decimal opcional,
 * listo para Excel en español.
 */
export function vertexTableCsv(rows: VertexRow[], opts: { decimals?: number; decimalComma?: boolean; epsg?: number } = {}): string {
  const dec = opts.decimals ?? 2;
  const f = (n: number) => (opts.decimalComma ?? true ? n.toFixed(dec).replace('.', ',') : n.toFixed(dec));
  const head = ['Recinto', 'Anillo', 'Vértice', 'X (m)', 'Y (m)', 'Lado (m)'];
  const lines = [head.join(';'), ...rows.map((r) => [r.recinto, r.anillo, r.vertice, f(r.x), f(r.y), f(r.lado)].join(';'))];
  if (opts.epsg) lines.unshift(`# Sistema de referencia: EPSG:${opts.epsg}`);
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Resumen de superficies y perímetros por recinto. */
export function areaSummary(items: { id: string; polygons: Polygon[] }[]) {
  return items.flatMap((it) =>
    it.polygons.map((p, i) => ({
      recinto: it.polygons.length > 1 ? `${it.id}-${i + 1}` : it.id,
      superficie: polygonArea(p),
      perimetro: perimeter(closeRing(p.exterior)),
      vertices: closeRing(p.exterior).length - 1,
      interiores: p.interiors.length,
    })),
  );
}
