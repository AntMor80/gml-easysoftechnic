import { densifyArc } from '../geometry.js';
import type { LineString, Point, Ring } from '../types.js';

export interface DxfEntity {
  type: 'LWPOLYLINE' | 'POLYLINE' | 'LINE' | 'ARC' | 'CIRCLE';
  layer: string;
  closed: boolean;
  points: Point[];
}

export interface DxfReadResult {
  entities: DxfEntity[];
  layers: string[];
  /** Entidades no admitidas que se han ignorado, con su número. */
  ignored: Record<string, number>;
}

/** Lee pares código/valor de un DXF ASCII. */
function pairs(text: string): [number, string][] {
  const lines = text.split(/\r?\n/);
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    out.push([Number(lines[i]!.trim()), lines[i + 1]!.trim()]);
  }
  return out;
}

/** Segmento con abombamiento (bulge) de una LWPOLYLINE convertido en arco con vértices. */
function bulgeArc(a: Point, b: Point, bulge: number, maxSagitta: number): Point[] {
  const theta = 4 * Math.atan(bulge);
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const r = Math.abs(chord / (2 * Math.sin(theta / 2)));
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const d = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
  const ux = (b[0] - a[0]) / chord;
  const uy = (b[1] - a[1]) / chord;
  const side = (bulge > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const c: Point = [mx - uy * d * side, my + ux * d * side];
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
  const pts = bulge > 0 ? densifyArc(c, r, a0, a1, maxSagitta) : densifyArc(c, r, a1, a0, maxSagitta).reverse();
  pts[0] = a;
  pts[pts.length - 1] = b;
  return pts;
}

/**
 * Lee un DXF ASCII (R12 a 2018) y extrae polilíneas, líneas, arcos y círculos.
 * Los arcos y curvas se sustituyen por vértices con flecha < `maxSagitta`
 * (2 cm por defecto, criterio del Catastro). La coordenada Z se descarta.
 */
export function readDxf(text: string, maxSagitta = 0.02): DxfReadResult {
  const p = pairs(text);
  const entities: DxfEntity[] = [];
  const layers = new Set<string>();
  const ignored: Record<string, number> = {};
  let inEntities = false;
  let i = 0;
  const known = new Set(['LWPOLYLINE', 'POLYLINE', 'LINE', 'ARC', 'CIRCLE']);
  while (i < p.length) {
    const [code, value] = p[i]!;
    if (code === 2 && value === 'ENTITIES') inEntities = true;
    if (code === 0 && value === 'ENDSEC') inEntities = false;
    if (!inEntities || code !== 0 || value === 'SECTION' || value === 'ENDSEC') {
      i++;
      continue;
    }
    const type = value;
    // recoger los pares de esta entidad
    const start = ++i;
    while (i < p.length && p[i]![0] !== 0) i++;
    const body = p.slice(start, i);
    const layer = body.find(([c]) => c === 8)?.[1] ?? '0';
    if (!known.has(type)) {
      if (type !== 'VERTEX' && type !== 'SEQEND') ignored[type] = (ignored[type] ?? 0) + 1;
      continue;
    }
    layers.add(layer);
    if (type === 'LWPOLYLINE') {
      const flags = Number(body.find(([c]) => c === 70)?.[1] ?? 0);
      const verts: { p: Point; bulge: number }[] = [];
      for (let k = 0; k < body.length; k++) {
        const [c, v] = body[k]!;
        if (c === 10) {
          const y = body.slice(k + 1).find(([cc]) => cc === 20);
          verts.push({ p: [Number(v), Number(y?.[1] ?? 0)], bulge: 0 });
        } else if (c === 42 && verts.length) verts[verts.length - 1]!.bulge = Number(v);
      }
      const closed = (flags & 1) === 1;
      entities.push({ type: 'LWPOLYLINE', layer, closed, points: expandBulges(verts, closed, maxSagitta) });
    } else if (type === 'POLYLINE') {
      const flags = Number(body.find(([c]) => c === 70)?.[1] ?? 0);
      const verts: { p: Point; bulge: number }[] = [];
      // los VERTEX siguen como entidades propias hasta SEQEND
      while (i < p.length && p[i]![1] === 'VERTEX') {
        const vs = ++i;
        while (i < p.length && p[i]![0] !== 0) i++;
        const vb = p.slice(vs, i);
        verts.push({
          p: [Number(vb.find(([c]) => c === 10)?.[1] ?? 0), Number(vb.find(([c]) => c === 20)?.[1] ?? 0)],
          bulge: Number(vb.find(([c]) => c === 42)?.[1] ?? 0),
        });
      }
      const closed = (flags & 1) === 1;
      entities.push({ type: 'POLYLINE', layer, closed, points: expandBulges(verts, closed, maxSagitta) });
    } else if (type === 'LINE') {
      const g = (c: number) => Number(body.find(([cc]) => cc === c)?.[1] ?? 0);
      entities.push({ type: 'LINE', layer, closed: false, points: [[g(10), g(20)], [g(11), g(21)]] });
    } else if (type === 'ARC' || type === 'CIRCLE') {
      const g = (c: number) => Number(body.find(([cc]) => cc === c)?.[1] ?? 0);
      const c: Point = [g(10), g(20)];
      const r = g(40);
      const a0 = type === 'ARC' ? (g(50) * Math.PI) / 180 : 0;
      const a1 = type === 'ARC' ? (g(51) * Math.PI) / 180 : 2 * Math.PI;
      const pts = densifyArc(c, r, a0, a1, maxSagitta);
      entities.push({ type, layer, closed: type === 'CIRCLE', points: pts });
    }
  }
  return { entities, layers: [...layers].sort(), ignored };
}

function expandBulges(verts: { p: Point; bulge: number }[], closed: boolean, maxSagitta: number): Point[] {
  const out: Point[] = [];
  const n = verts.length;
  const segs = closed ? n : n - 1;
  for (let k = 0; k < segs; k++) {
    const a = verts[k]!;
    const b = verts[(k + 1) % n]!;
    if (out.length === 0) out.push(a.p);
    if (Math.abs(a.bulge) > 1e-12) out.push(...bulgeArc(a.p, b.p, a.bulge, maxSagitta).slice(1));
    else out.push(b.p);
  }
  if (n === 1) out.push(verts[0]!.p);
  return out;
}

/** Separa las entidades en anillos cerrados y líneas abiertas, opcionalmente filtrando capas. */
export function dxfToGeometry(res: DxfReadResult, layers?: string[]): { rings: Ring[]; lines: LineString[] } {
  const rings: Ring[] = [];
  const lines: LineString[] = [];
  for (const e of res.entities) {
    if (layers && !layers.includes(e.layer)) continue;
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    const touching = first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.001;
    if ((e.closed || touching) && e.points.length >= 3) {
      rings.push(touching ? e.points : [...e.points, e.points[0]!]);
    } else lines.push(e.points);
  }
  return { rings, lines };
}

/** Escribe un DXF R12 sencillo con polilíneas cerradas (una capa por grupo). */
export function writeDxf(groups: { layer: string; rings: Ring[] }[], decimals = 3): string {
  const out: string[] = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const g of groups) {
    for (const r of g.rings) {
      out.push('0', 'POLYLINE', '8', g.layer, '66', '1', '70', '1');
      const pts = r.length > 1 && r[0]![0] === r[r.length - 1]![0] && r[0]![1] === r[r.length - 1]![1] ? r.slice(0, -1) : r;
      for (const [x, y] of pts) out.push('0', 'VERTEX', '8', g.layer, '10', x.toFixed(decimals), '20', y.toFixed(decimals), '30', '0.0');
      out.push('0', 'SEQEND', '8', g.layer);
    }
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n') + '\n';
}
