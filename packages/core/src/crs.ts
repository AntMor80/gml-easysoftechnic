import proj4 from 'proj4';
import type { Point, Polygon } from './types.js';

/**
 * Sistemas de referencia usados en España.
 * ETRS89 UTM (25828-25831) es el oficial en la península y Baleares;
 * en Canarias el Catastro usa WGS84 UTM 27N/28N (32627/32628).
 * ED50 (230xx) se incluye para transformar planos antiguos; la conversión
 * con 7 parámetros es aproximada (decímetros). Para precisión centimétrica
 * se cargará la rejilla NTv2 oficial del IGN (PENR2009) en la fase 3.
 */
const ED50_TOWGS84 = '-131.032,-100.251,-163.354,1.2438,0.0195,1.1436,9.39';

export const CRS_DEFS: Record<number, { name: string; proj4: string }> = {
  4258: { name: 'ETRS89 geográficas', proj4: '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs' },
  4326: { name: 'WGS84 geográficas', proj4: '+proj=longlat +datum=WGS84 +no_defs' },
  25828: { name: 'ETRS89 / UTM 28N', proj4: '+proj=utm +zone=28 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  25829: { name: 'ETRS89 / UTM 29N', proj4: '+proj=utm +zone=29 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  25830: { name: 'ETRS89 / UTM 30N', proj4: '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  25831: { name: 'ETRS89 / UTM 31N', proj4: '+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  32627: { name: 'WGS84 / UTM 27N', proj4: '+proj=utm +zone=27 +datum=WGS84 +units=m +no_defs' },
  32628: { name: 'WGS84 / UTM 28N', proj4: '+proj=utm +zone=28 +datum=WGS84 +units=m +no_defs' },
  23029: { name: 'ED50 / UTM 29N', proj4: `+proj=utm +zone=29 +ellps=intl +towgs84=${ED50_TOWGS84} +units=m +no_defs` },
  23030: { name: 'ED50 / UTM 30N', proj4: `+proj=utm +zone=30 +ellps=intl +towgs84=${ED50_TOWGS84} +units=m +no_defs` },
  23031: { name: 'ED50 / UTM 31N', proj4: `+proj=utm +zone=31 +ellps=intl +towgs84=${ED50_TOWGS84} +units=m +no_defs` },
  3857: { name: 'Web Mercator', proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs' },
};

for (const [code, def] of Object.entries(CRS_DEFS)) proj4.defs(`EPSG:${code}`, def.proj4);

/** Husos UTM que acepta el Catastro, para los selectores de la interfaz. */
export const CATASTRO_UTM_ZONES = [
  { zone: '27N', epsg: 32627 },
  { zone: '28N', epsg: 32628 },
  { zone: '29N', epsg: 25829 },
  { zone: '30N', epsg: 25830 },
  { zone: '31N', epsg: 25831 },
] as const;

export function srsUri(epsg: number): string {
  return `http://www.opengis.net/def/crs/EPSG/0/${epsg}`;
}

/** Extrae el código EPSG de un srsName (URI, URN o "EPSG:xxxx"). */
export function parseSrsName(srs: string | undefined): number | undefined {
  if (!srs) return undefined;
  const m = srs.match(/(\d{4,5})\s*$/);
  return m ? Number(m[1]) : undefined;
}

export function transformPoint(p: Point, from: number, to: number): Point {
  if (from === to) return p;
  const r = proj4(`EPSG:${from}`, `EPSG:${to}`, [p[0], p[1]]);
  return [r[0]!, r[1]!];
}

export function transformPolygon(poly: Polygon, from: number, to: number): Polygon {
  const t = (r: Point[]) => r.map((p) => transformPoint(p, from, to));
  return { exterior: t(poly.exterior), interiors: poly.interiors.map(t) };
}

/** Huso UTM que corresponde a una longitud (grados). */
export function utmZoneForLongitude(lon: number): number {
  return Math.floor((lon + 180) / 6) + 1;
}

/**
 * Corrección de "catastro desplazado": traslación (y giro opcional)
 * calculada a partir de pares de puntos homólogos (origen → destino).
 * Con un par se aplica solo traslación; con dos o más, una transformación
 * de Helmert 2D (traslación, giro y escala) por mínimos cuadrados.
 */
export function helmert2D(pairs: { from: Point; to: Point }[]) {
  if (pairs.length === 0) throw new Error('Hacen falta pares de puntos');
  if (pairs.length === 1) {
    const [{ from, to }] = pairs as [{ from: Point; to: Point }];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    return { a: 1, b: 0, tx: dx, ty: dy, apply: (p: Point): Point => [p[0] + dx, p[1] + dy] };
  }
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p.from[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p.from[1], 0) / n;
  const nx = pairs.reduce((s, p) => s + p.to[0], 0) / n;
  const ny = pairs.reduce((s, p) => s + p.to[1], 0) / n;
  let sxx = 0, sab = 0, sba = 0;
  for (const { from, to } of pairs) {
    const x = from[0] - mx, y = from[1] - my, X = to[0] - nx, Y = to[1] - ny;
    sxx += x * x + y * y;
    sab += x * X + y * Y;
    sba += x * Y - y * X;
  }
  const a = sab / sxx;
  const b = sba / sxx;
  const tx = nx - (a * mx - b * my);
  const ty = ny - (b * mx + a * my);
  return { a, b, tx, ty, apply: (p: Point): Point => [a * p[0] - b * p[1] + tx, b * p[0] + a * p[1] + ty] };
}
