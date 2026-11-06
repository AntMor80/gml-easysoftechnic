import { closeRing, orientPolygon, totalArea } from '../geometry.js';
import { transformPolygon } from '../crs.js';
import type { Point, Polygon } from '../types.js';
import type { ExportFeature } from './features.js';

/**
 * GeoJSON (RFC 7946). Por norma va en WGS84 (lon, lat); con `keepCrs`
 * se conservan las coordenadas UTM para QGIS y se añade el CRS antiguo.
 */
export function toGeoJson(features: ExportFeature[], epsg: number, opts: { keepCrs?: boolean; decimals?: number } = {}) {
  const target = opts.keepCrs ? epsg : 4326;
  const dec = opts.decimals ?? (target === 4326 ? 8 : 3);
  const f = 10 ** dec;
  const r = (p: Point) => [Math.round(p[0] * f) / f, Math.round(p[1] * f) / f];
  const geo = {
    type: 'FeatureCollection' as const,
    ...(opts.keepCrs ? { crs: { type: 'name', properties: { name: `urn:ogc:def:crs:EPSG::${epsg}` } } } : {}),
    features: features.map((ft) => ({
      type: 'Feature' as const,
      id: ft.id,
      properties: { id: ft.id, superficie_m2: Number(totalArea(ft.polygons).toFixed(2)), ...ft.properties },
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: ft.polygons.map((p) => {
          const o = orientPolygon(target === epsg ? p : transformPolygon(p, epsg, target));
          return [o.exterior, ...o.interiors].map((ring) => closeRing(ring).map(r));
        }),
      },
    })),
  };
  return JSON.stringify(geo, null, 1);
}

/** Lee un GeoJSON con polígonos o multipolígonos (en el CRS indicado o WGS84). */
export function fromGeoJson(text: string, toEpsg?: number): ExportFeature[] {
  const doc = JSON.parse(text) as { features?: unknown[]; type?: string; geometry?: unknown };
  const feats = (doc.type === 'FeatureCollection' ? doc.features : [doc]) as {
    id?: string | number;
    properties?: Record<string, unknown>;
    geometry?: { type: string; coordinates: number[][][] | number[][][][] };
  }[];
  return feats
    .filter((f) => f.geometry && /Polygon/.test(f.geometry.type))
    .map((f, i) => {
      const g = f.geometry!;
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
      let polygons: Polygon[] = polys.map((rings) => ({
        exterior: rings[0]!.map((c) => [c[0]!, c[1]!] as Point),
        interiors: rings.slice(1).map((r) => r.map((c) => [c[0]!, c[1]!] as Point)),
      }));
      if (toEpsg) polygons = polygons.map((p) => transformPolygon(p, 4326, toEpsg));
      const props = (f.properties ?? {}) as Record<string, string | number | boolean | null>;
      return { id: String(f.id ?? props['id'] ?? `F${i + 1}`), polygons, properties: props };
    });
}
