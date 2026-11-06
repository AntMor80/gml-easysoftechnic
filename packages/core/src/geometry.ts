import type { LineString, Point, Polygon, Ring } from './types.js';

const EPS = 1e-9;

export function samePoint(a: Point, b: Point, tol = EPS): boolean {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
}

export function isClosed(ring: Ring, tol = EPS): boolean {
  return ring.length > 1 && samePoint(ring[0]!, ring[ring.length - 1]!, tol);
}

/** Devuelve el anillo cerrado (añade el primer punto al final si hace falta). */
export function closeRing(ring: Ring, tol = EPS): Ring {
  if (ring.length === 0) return [];
  if (isClosed(ring, tol)) {
    const copy = ring.slice();
    copy[copy.length - 1] = [ring[0]![0], ring[0]![1]];
    return copy;
  }
  return [...ring, [ring[0]![0], ring[0]![1]]];
}

/** Quita vértices consecutivos repetidos (dentro de la tolerancia). */
export function removeDuplicateVertices(ring: Ring, tol = 0.001): Ring {
  const out: Ring = [];
  for (const p of ring) {
    if (out.length === 0 || !samePoint(out[out.length - 1]!, p, tol)) out.push(p);
  }
  return out;
}

/** Área con signo (fórmula del área de Gauss). Positiva = sentido antihorario. */
export function signedArea(ring: Ring): number {
  let s = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    s += x1 * y2 - x2 * y1;
  }
  if (n > 1 && !isClosed(ring)) {
    const [x1, y1] = ring[n - 1]!;
    const [x2, y2] = ring[0]!;
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function isCounterClockwise(ring: Ring): boolean {
  return signedArea(ring) > 0;
}

export function reverseRing(ring: Ring): Ring {
  return ring.slice().reverse();
}

/** Superficie de un polígono: exterior menos interiores. */
export function polygonArea(p: Polygon): number {
  const ext = Math.abs(signedArea(p.exterior));
  const holes = p.interiors.reduce((s, r) => s + Math.abs(signedArea(r)), 0);
  return ext - holes;
}

export function totalArea(polys: Polygon[]): number {
  return polys.reduce((s, p) => s + polygonArea(p), 0);
}

export function perimeter(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

/**
 * Orienta como exige INSPIRE/GML 3.2 y el Catastro:
 * exterior en sentido antihorario e interiores en sentido horario.
 */
export function orientPolygon(p: Polygon): Polygon {
  const ext = closeRing(p.exterior);
  return {
    exterior: isCounterClockwise(ext) ? ext : reverseRing(ext),
    interiors: p.interiors.map((r) => {
      const c = closeRing(r);
      return isCounterClockwise(c) ? reverseRing(c) : c;
    }),
  };
}

/** Redondea todas las coordenadas a `decimals` decimales. */
export function roundRing(ring: Ring, decimals: number): Ring {
  const f = 10 ** decimals;
  return ring.map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f]);
}

export function roundPolygon(p: Polygon, decimals: number): Polygon {
  return {
    exterior: roundRing(p.exterior, decimals),
    interiors: p.interiors.map((r) => roundRing(r, decimals)),
  };
}

function orient(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a[0], b[0]) - EPS <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

/** ¿Se cortan los segmentos ab y cd (incluye contacto)? */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }
  if (Math.abs(d1) <= EPS && onSegment(c, d, a)) return true;
  if (Math.abs(d2) <= EPS && onSegment(c, d, b)) return true;
  if (Math.abs(d3) <= EPS && onSegment(a, b, c)) return true;
  if (Math.abs(d4) <= EPS && onSegment(a, b, d)) return true;
  return false;
}

/** Punto de corte de las rectas ab y cd (si son paralelas, el extremo más cercano). */
export function intersectionPoint(a: Point, b: Point, c: Point, d: Point): Point {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-12) return c;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Devuelve los puntos donde el anillo se corta a sí mismo (segmentos no contiguos). */
export function selfIntersections(ring: Ring): Point[] {
  const r = closeRing(ring);
  const n = r.length - 1; // número de segmentos
  const hits: Point[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // segmentos contiguos
      if (segmentsIntersect(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!)) hits.push(intersectionPoint(r[i]!, r[i + 1]!, r[j]!, r[j + 1]!));
    }
  }
  return hits;
}

/** Punto dentro de anillo (ray casting). Los puntos del borde cuentan como dentro. */
export function pointInRing(p: Point, ring: Ring): boolean {
  const r = closeRing(ring);
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i]!;
    const b = r[i + 1]!;
    if (Math.abs(orient(a, b, p)) <= 1e-7 && onSegment(a, b, p)) return true;
  }
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length - 1; j = i++) {
    const [xi, yi] = r[i]!;
    const [xj, yj] = r[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: Point, poly: Polygon): boolean {
  if (!pointInRing(p, poly.exterior)) return false;
  return !poly.interiors.some((h) => pointInRing(p, h) && !pointOnRing(p, h));
}

function pointOnRing(p: Point, ring: Ring): boolean {
  const r = closeRing(ring);
  for (let i = 0; i < r.length - 1; i++) {
    if (distancePointSegment(p, r[i]!, r[i + 1]!) <= 1e-7) return true;
  }
  return false;
}

export function distancePointSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function distancePointRing(p: Point, ring: Ring): number {
  const r = closeRing(ring);
  let d = Infinity;
  for (let i = 0; i < r.length - 1; i++) d = Math.min(d, distancePointSegment(p, r[i]!, r[i + 1]!));
  return d;
}

/**
 * Comprueba que todos los vértices de `inner` caen dentro de `outer`,
 * admitiendo que sobresalgan hasta `tolerance` metros (criterio del ICUC).
 * Devuelve los vértices que quedan fuera.
 */
export function verticesOutside(inner: Polygon, outer: Polygon[], tolerance = 0): Point[] {
  const out: Point[] = [];
  for (const p of inner.exterior) {
    const inside = outer.some(
      (o) => pointInPolygon(p, o) || distancePointRing(p, o.exterior) <= tolerance,
    );
    if (!inside) out.push(p);
  }
  return out;
}

/**
 * Convierte un conjunto de líneas sueltas (como llegan de un DXF) en anillos cerrados,
 * uniendo extremos que coinciden dentro de `snap` metros.
 * Devuelve los anillos cerrados y las líneas que no se pudieron cerrar.
 */
export function linesToRings(lines: LineString[], snap = 0.01): { rings: Ring[]; open: LineString[] } {
  const pool = lines.filter((l) => l.length >= 2).map((l) => l.slice());
  const rings: Ring[] = [];
  const open: LineString[] = [];
  while (pool.length > 0) {
    let chain = pool.shift()!;
    let grown = true;
    while (grown && !samePoint(chain[0]!, chain[chain.length - 1]!, snap)) {
      grown = false;
      const end = chain[chain.length - 1]!;
      const start = chain[0]!;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i]!;
        const ls = l[0]!;
        const le = l[l.length - 1]!;
        if (samePoint(end, ls, snap)) chain = [...chain, ...l.slice(1)];
        else if (samePoint(end, le, snap)) chain = [...chain, ...l.slice(0, -1).reverse()];
        else if (samePoint(start, le, snap)) chain = [...l.slice(0, -1), ...chain];
        else if (samePoint(start, ls, snap)) chain = [...l.slice(1).reverse(), ...chain];
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (chain.length >= 4 && samePoint(chain[0]!, chain[chain.length - 1]!, snap)) {
      rings.push(closeRing(chain, snap));
    } else {
      open.push(chain);
    }
  }
  return { rings, open };
}

/**
 * Agrupa anillos en polígonos: cada anillo contenido en otro pasa a ser su interior.
 * Sirve para detectar islas y patios automáticamente.
 */
export function ringsToPolygons(rings: Ring[]): Polygon[] {
  const sorted = rings
    .map((r) => closeRing(r))
    .sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const depth = sorted.map((r, i) =>
    sorted.slice(0, i).filter((o) => pointInRing(innerPoint(r), o)).length,
  );
  const polys: { poly: Polygon; ring: Ring }[] = [];
  sorted.forEach((r, i) => {
    if (depth[i]! % 2 === 0) {
      polys.push({ poly: { exterior: r, interiors: [] }, ring: r });
    } else {
      // el exterior más pequeño que lo contiene
      for (let k = polys.length - 1; k >= 0; k--) {
        if (pointInRing(innerPoint(r), polys[k]!.ring)) {
          polys[k]!.poly.interiors.push(r);
          break;
        }
      }
    }
  });
  return polys.map((p) => orientPolygon(p.poly));
}

function innerPoint(ring: Ring): Point {
  // punto medio del primer segmento desplazado ligeramente hacia dentro
  const a = ring[0]!;
  const b = ring[1]!;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = -(b[1] - a[1]);
  const ny = b[0] - a[0];
  const len = Math.hypot(nx, ny) || 1;
  const s = isCounterClockwise(ring) ? 1e-4 : -1e-4;
  return [mx + (nx / len) * s, my + (ny / len) * s];
}

/** Líneas a superficies: une líneas, cierra anillos y detecta interiores. */
export function linesToPolygons(lines: LineString[], snap = 0.01): { polygons: Polygon[]; open: LineString[] } {
  const { rings, open } = linesToRings(lines, snap);
  return { polygons: ringsToPolygons(rings), open };
}

/** Superficies a líneas: devuelve cada anillo como polilínea cerrada. */
export function polygonsToLines(polys: Polygon[]): LineString[] {
  return polys.flatMap((p) => [p.exterior, ...p.interiors].map((r) => closeRing(r)));
}

/**
 * Separación máxima entre vértices al sustituir un arco por segmentos,
 * para que la flecha sea menor que `maxSagitta` (2 cm según el Catastro).
 */
export function chordLengthForRadius(radius: number, maxSagitta = 0.02): number {
  if (radius <= maxSagitta) return radius;
  return 2 * Math.sqrt(2 * radius * maxSagitta - maxSagitta * maxSagitta);
}

/** Genera los vértices de un arco de centro c, radio r, de ang0 a ang1 (radianes, antihorario). */
export function densifyArc(c: Point, r: number, ang0: number, ang1: number, maxSagitta = 0.02): Point[] {
  let sweep = ang1 - ang0;
  if (sweep <= 0) sweep += 2 * Math.PI;
  const chord = chordLengthForRadius(r, maxSagitta);
  const step = 2 * Math.asin(Math.min(1, chord / (2 * r)));
  const n = Math.max(1, Math.ceil(sweep / step));
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ang0 + (sweep * i) / n;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

export function bbox(points: Point[]): [number, number, number, number] {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of points) {
    if (x < minx) minx = x;
    if (y < miny) miny = y;
    if (x > maxx) maxx = x;
    if (y > maxy) maxy = y;
  }
  return [minx, miny, maxx, maxy];
}
