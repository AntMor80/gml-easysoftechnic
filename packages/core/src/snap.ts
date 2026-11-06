import { closeRing, distancePointSegment, removeDuplicateVertices, samePoint } from './geometry.js';
import type { Point, Polygon, Ring } from './types.js';

export interface SnapResult {
  polygons: Polygon[];
  /** Vértices desplazados: posición original, nueva y distancia (m). */
  moved: { from: Point; to: Point; distance: number }[];
  /** Vértices del colindante insertados en los lados para que la medianera coincida. */
  inserted: Point[];
}

function project(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (!l2) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return [a[0] + t * dx, a[1] + t * dy];
}

function snapRing(ring: Ring, refRings: Ring[], tol: number, res: SnapResult): Ring {
  const refVerts = refRings.flatMap((r) => closeRing(r).slice(0, -1));
  const refSegs: [Point, Point][] = refRings.flatMap((r) => {
    const c = closeRing(r);
    return c.slice(0, -1).map((p, i) => [p, c[i + 1]!] as [Point, Point]);
  });
  // 1) mover vértices al vértice o lado más cercano del colindante
  const pts = closeRing(ring).slice(0, -1).map((p): Point => {
    let best: Point | undefined;
    let bd = tol;
    for (const v of refVerts) {
      const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
      if (d <= bd) { bd = d; best = v; }
    }
    if (!best) {
      for (const [a, b] of refSegs) {
        const d = distancePointSegment(p, a, b);
        if (d <= bd) { bd = d; best = project(p, a, b); }
      }
    }
    if (best && !samePoint(best, p, 1e-9)) {
      res.moved.push({ from: p, to: [best[0], best[1]], distance: bd });
      return [best[0], best[1]];
    }
    return p;
  });
  // 2) insertar vértices del colindante que caen sobre los lados propios
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    out.push(a);
    const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    const onEdge = refVerts
      .filter((v) => !samePoint(v, a, 1e-6) && !samePoint(v, b, 1e-6) && distancePointSegment(v, a, b) <= tol)
      .map((v) => ({ v, t: ((v[0] - a[0]) * (b[0] - a[0]) + (v[1] - a[1]) * (b[1] - a[1])) / (len2 || 1) }))
      .filter(({ t }) => t > 1e-9 && t < 1 - 1e-9)
      .sort((x, y) => x.t - y.t);
    for (const { v } of onEdge) {
      out.push([v[0], v[1]]);
      res.inserted.push([v[0], v[1]]);
    }
  }
  return closeRing(removeDuplicateVertices(out, 1e-6));
}

/**
 * Encaja los recintos con los de un colindante (o con la parcela catastral):
 * mueve los vértices que están a menos de `tolerance` metros y añade los
 * vértices del colindante sobre los lados comunes, para que la medianera
 * sea idéntica y no haya solapes ni huecos.
 */
export function snapToReference(polys: Polygon[], reference: Polygon[], tolerance = 0.05): SnapResult {
  const res: SnapResult = { polygons: [], moved: [], inserted: [] };
  const refRings = reference.flatMap((p) => [p.exterior, ...p.interiors]);
  res.polygons = polys.map((p) => ({
    exterior: snapRing(p.exterior, refRings, tolerance, res),
    interiors: p.interiors.map((r) => snapRing(r, refRings, tolerance, res)),
  }));
  return res;
}
