import { areaSummary, vertexTable } from '../io/csv.js';
import { CRS_DEFS } from '../crs.js';
import type { Polygon } from '../types.js';
import { toXlsx } from './xlsx.js';

/** Excel de coordenadas: hoja de vértices y hoja de superficies. */
export function coordinatesWorkbook(items: { id: string; polygons: Polygon[] }[], epsg: number): Uint8Array {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const vertices = vertexTable(items);
  const summary = areaSummary(items);
  return toXlsx([
    {
      name: 'Vértices',
      widths: [22, 10, 9, 14, 14, 10],
      rows: [
        ['Recinto', 'Anillo', 'Vértice', 'X (m)', 'Y (m)', 'Lado (m)'],
        ...vertices.map((v) => [v.recinto, v.anillo, v.vertice, r2(v.x), r2(v.y), r2(v.lado)]),
      ],
    },
    {
      name: 'Superficies',
      widths: [22, 16, 14, 10, 10],
      rows: [
        ['Recinto', 'Superficie (m²)', 'Perímetro (m)', 'Vértices', 'Interiores'],
        ...summary.map((s) => [s.recinto, r2(s.superficie), r2(s.perimetro), s.vertices, s.interiores]),
        [],
        ['Sistema de referencia', `EPSG:${epsg} ${CRS_DEFS[epsg]?.name ?? ''}`],
      ],
    },
  ]);
}
