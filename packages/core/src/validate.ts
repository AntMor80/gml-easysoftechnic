import {
  closeRing,
  isClosed,
  isCounterClockwise,
  polygonArea,
  pointInRing,
  removeDuplicateVertices,
  segmentsIntersect,
  selfIntersections,
  verticesOutside,
} from './geometry.js';
import polygonClipping from 'polygon-clipping';
import type { Issue, Polygon } from './types.js';

export interface ValidateOptions {
  /** Distancia mínima entre vértices consecutivos (m). */
  minVertexDistance?: number;
  /** Superficie mínima de un recinto (m²). */
  minArea?: number;
  /** Solape mínimo que se considera error (m²). */
  overlapTolerance?: number;
}

const RC_14 = /^[0-9A-Z]{14}$/;
const RC_20 = /^[0-9A-Z]{20}$/;

/** Comprueba la estructura de una referencia catastral (14 o 20 caracteres). */
export function isValidCadastralReference(rc: string): boolean {
  const s = rc.trim().toUpperCase();
  return RC_14.test(s) || RC_20.test(s);
}

/**
 * Validación previa con las reglas que aplica el Catastro (IVG):
 * anillos cerrados, mínimo de vértices, sin autointersecciones,
 * sin vértices duplicados, interiores dentro del exterior y sin solapes entre recintos.
 * No sustituye a la validación oficial; avisa antes de enviar.
 */
export function validatePolygons(polys: Polygon[], opts: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const minDist = opts.minVertexDistance ?? 0.01;
  const minArea = opts.minArea ?? 0.01;
  polys.forEach((poly, pi) => {
    const rings = [poly.exterior, ...poly.interiors];
    rings.forEach((ring, ri) => {
      const where = { polygon: pi, ring: ri };
      if (!isClosed(ring, 0.001)) {
        issues.push({ code: 'RING_NOT_CLOSED', severity: 'warning', message: `El recinto ${pi + 1}${ri ? `, interior ${ri}` : ''} no está cerrado; se cerrará automáticamente.`, ...where });
      }
      const closed = closeRing(ring);
      if (closed.length < 4) {
        issues.push({ code: 'TOO_FEW_VERTICES', severity: 'error', message: `El recinto ${pi + 1} tiene menos de 3 vértices.`, ...where });
        return;
      }
      const dedup = removeDuplicateVertices(closed, minDist);
      if (dedup.length < closed.length) {
        issues.push({ code: 'DUPLICATE_VERTICES', severity: 'warning', message: `Hay ${closed.length - dedup.length} vértices repetidos o a menos de ${minDist} m en el recinto ${pi + 1}.`, ...where });
      }
      for (const p of selfIntersections(closed)) {
        issues.push({ code: 'SELF_INTERSECTION', severity: 'error', message: `El contorno del recinto ${pi + 1} se cruza consigo mismo.`, point: p, ...where });
      }
      if (ri === 0 && !isCounterClockwise(closed)) {
        issues.push({ code: 'EXTERIOR_ORIENTATION', severity: 'warning', message: `El exterior del recinto ${pi + 1} está en sentido horario; se invertirá al generar el GML.`, ...where });
      }
      if (ri > 0) {
        const outside = closed.filter((p) => !pointInRing(p, poly.exterior));
        if (outside.length) {
          issues.push({ code: 'INTERIOR_OUTSIDE', severity: 'error', message: `El interior ${ri} del recinto ${pi + 1} sale fuera de su contorno exterior.`, point: outside[0], ...where });
        }
      }
    });
    if (polygonArea({ exterior: closeRing(poly.exterior), interiors: poly.interiors.map((r) => closeRing(r)) }) < minArea) {
      issues.push({ code: 'AREA_TOO_SMALL', severity: 'error', message: `El recinto ${pi + 1} tiene una superficie nula o casi nula.`, polygon: pi });
    }
  });
  // solapes entre recintos distintos
  for (let a = 0; a < polys.length; a++) {
    for (let b = a + 1; b < polys.length; b++) {
      const ov = overlapArea(polys[a]!, polys[b]!);
      if (ov > (opts.overlapTolerance ?? 0.0001)) {
        issues.push({ code: 'OVERLAP', severity: 'error', message: `Los recintos ${a + 1} y ${b + 1} se solapan ${ov.toFixed(4)} m².`, polygon: a });
      }
    }
  }
  return issues;
}

type PcPoly = [number, number][][];
const toPc = (p: Polygon): PcPoly => [closeRing(p.exterior), ...p.interiors.map((r) => closeRing(r))];

function ringsArea(mp: PcPoly[]): number {
  const a = (r: [number, number][]) => {
    let s = 0;
    for (let i = 0; i < r.length - 1; i++) s += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
    return Math.abs(s / 2);
  };
  return mp.reduce((t, poly) => t + a(poly[0]!) - poly.slice(1).reduce((h, r) => h + a(r), 0), 0);
}

/** Superficie común entre dos recintos (m²). Los bordes compartidos no suman. */
export function overlapArea(a: Polygon, b: Polygon): number {
  return ringsArea(polygonClipping.intersection(toPc(a), toPc(b)) as PcPoly[]);
}

/**
 * Solapes entre los elementos de varios archivos (p. ej. viviendas colindantes):
 * devuelve cada par que se solapa y su superficie.
 */
export function crossOverlaps(items: { id: string; polygons: Polygon[] }[], tolerance = 0.0001) {
  const out: { a: string; b: string; area: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      let area = 0;
      for (const pa of items[i]!.polygons) for (const pb of items[j]!.polygons) area += overlapArea(pa, pb);
      if (area > tolerance) out.push({ a: items[i]!.id, b: items[j]!.id, area });
    }
  }
  return out;
}

/** Solape de interiores (los bordes compartidos no cuentan como solape). */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  const ra = closeRing(a.exterior);
  const rb = closeRing(b.exterior);
  // cruce propio de aristas
  for (let i = 0; i < ra.length - 1; i++) {
    for (let j = 0; j < rb.length - 1; j++) {
      if (properCross(ra[i]!, ra[i + 1]!, rb[j]!, rb[j + 1]!)) return true;
    }
  }
  // uno contiene al otro (comprobando el centro de una arista para evitar vértices compartidos)
  const mid = (r: typeof ra): [number, number] => {
    const p = r[0]!, q = r[1]!;
    const c = centroidish(r);
    return [(p[0] + q[0]) / 2 * 0.999 + c[0] * 0.001, (p[1] + q[1]) / 2 * 0.999 + c[1] * 0.001];
  };
  return strictlyInside(mid(ra), rb) || strictlyInside(mid(rb), ra);
}

function centroidish(r: [number, number][]): [number, number] {
  const n = r.length - 1;
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) { x += r[i]![0]; y += r[i]![1]; }
  return [x / n, y / n];
}

function strictlyInside(p: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function properCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const e = 1e-9;
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e)) && segmentsIntersect(a, b, c, d);
}

/**
 * Comprobación del ICUC: cada construcción debe quedar dentro de la parcela,
 * con la tolerancia elegida (0,002 a 0,020 m).
 */
export function validateBuildingInParcel(building: Polygon[], parcel: Polygon[], tolerance = 0.005): Issue[] {
  const issues: Issue[] = [];
  building.forEach((b, i) => {
    const out = verticesOutside(b, parcel, tolerance);
    if (out.length) {
      issues.push({
        code: 'BUILDING_OUTSIDE_PARCEL',
        severity: 'error',
        message: `La construcción ${i + 1} tiene ${out.length} vértice(s) fuera de la parcela (tolerancia ${tolerance} m).`,
        polygon: i,
        point: out[0],
      });
    }
  });
  return issues;
}
