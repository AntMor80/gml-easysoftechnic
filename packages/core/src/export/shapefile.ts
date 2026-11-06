import { zipSync, strToU8 } from 'fflate';
import { bbox, closeRing, isCounterClockwise, reverseRing, totalArea } from '../geometry.js';
import type { Ring } from '../types.js';
import type { ExportFeature } from './features.js';

/** WKT en formato ESRI para el archivo .prj. */
export function esriPrj(epsg: number): string {
  const etrs = 'GEOGCS["GCS_ETRS_1989",DATUM["D_ETRS_1989",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  const wgs = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  const utm = (name: string, geog: string, zone: number) =>
    `PROJCS["${name}",${geog},PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",${zone * 6 - 183}.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`;
  if (epsg >= 25828 && epsg <= 25831) return utm(`ETRS_1989_UTM_Zone_${epsg - 25800}N`, etrs, epsg - 25800);
  if (epsg === 32627 || epsg === 32628) return utm(`WGS_1984_UTM_Zone_${epsg - 32600}N`, wgs, epsg - 32600);
  if (epsg === 4258) return etrs;
  if (epsg === 4326) return wgs;
  throw new Error(`Sistema EPSG:${epsg} no admitido para Shapefile`);
}

interface Field { name: string; type: 'C' | 'N'; length: number; decimals: number }

function dbf(rows: Record<string, string | number>[], fields: Field[]): Uint8Array {
  const headerLen = 32 + fields.length * 32 + 1;
  const recLen = 1 + fields.reduce((s, f) => s + f.length, 0);
  const buf = new Uint8Array(headerLen + recLen * rows.length + 1);
  const dv = new DataView(buf.buffer);
  const now = new Date();
  buf[0] = 0x03;
  buf[1] = now.getFullYear() - 1900;
  buf[2] = now.getMonth() + 1;
  buf[3] = now.getDate();
  dv.setUint32(4, rows.length, true);
  dv.setUint16(8, headerLen, true);
  dv.setUint16(10, recLen, true);
  buf[29] = 0x00;
  const enc = new TextEncoder();
  fields.forEach((f, i) => {
    const o = 32 + i * 32;
    buf.set(enc.encode(f.name.slice(0, 10)), o);
    buf[o + 11] = f.type.charCodeAt(0);
    buf[o + 16] = f.length;
    buf[o + 17] = f.decimals;
  });
  buf[headerLen - 1] = 0x0d;
  rows.forEach((row, r) => {
    let o = headerLen + r * recLen;
    buf[o++] = 0x20;
    for (const f of fields) {
      const v = row[f.name];
      let s = f.type === 'N' ? (typeof v === 'number' ? v.toFixed(f.decimals) : '') : String(v ?? '');
      let bytes = enc.encode(s);
      while (bytes.length > f.length) { s = s.slice(0, -1); bytes = enc.encode(s); }
      const cell = new Uint8Array(f.length).fill(0x20);
      if (f.type === 'N') cell.set(bytes, f.length - bytes.length);
      else cell.set(bytes, 0);
      buf.set(cell, o);
      o += f.length;
    }
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}

/**
 * Shapefile de polígonos (.shp, .shx, .dbf, .prj, .cpg) en un ZIP.
 * Atributos: ID, SUPERFICIE y los de `properties` (texto, hasta 10 caracteres de nombre).
 */
export function toShapefileZip(features: ExportFeature[], epsg: number, baseName = 'recintos'): Uint8Array {
  const recs = features.map((ft) => {
    const rings: Ring[] = [];
    for (const p of ft.polygons) {
      const ext = closeRing(p.exterior);
      rings.push(isCounterClockwise(ext) ? reverseRing(ext) : ext); // exterior horario en SHP
      for (const h of p.interiors) {
        const c = closeRing(h);
        rings.push(isCounterClockwise(c) ? c : reverseRing(c));
      }
    }
    const pts = rings.flat();
    const contentLen = 44 + 4 * rings.length + 16 * pts.length; // bytes
    return { rings, pts, contentLen, box: bbox(pts) };
  });
  const all = recs.flatMap((r) => r.pts);
  const box = all.length ? bbox(all) : [0, 0, 0, 0];
  const shpLen = 100 + recs.reduce((s, r) => s + 8 + r.contentLen, 0);
  const shp = new DataView(new ArrayBuffer(shpLen));
  const shx = new DataView(new ArrayBuffer(100 + 8 * recs.length));
  const header = (dv: DataView, len: number) => {
    dv.setInt32(0, 9994, false);
    dv.setInt32(24, len / 2, false);
    dv.setInt32(28, 1000, true);
    dv.setInt32(32, 5, true);
    box.forEach((v, i) => dv.setFloat64(36 + i * 8, v!, true));
  };
  header(shp, shpLen);
  header(shx, 100 + 8 * recs.length);
  let o = 100;
  recs.forEach((r, i) => {
    shx.setInt32(100 + i * 8, o / 2, false);
    shx.setInt32(104 + i * 8, r.contentLen / 2, false);
    shp.setInt32(o, i + 1, false);
    shp.setInt32(o + 4, r.contentLen / 2, false);
    let c = o + 8;
    shp.setInt32(c, 5, true);
    r.box.forEach((v, k) => shp.setFloat64(c + 4 + k * 8, v, true));
    shp.setInt32(c + 36, r.rings.length, true);
    shp.setInt32(c + 40, r.pts.length, true);
    c += 44;
    let start = 0;
    for (const ring of r.rings) { shp.setInt32(c, start, true); c += 4; start += ring.length; }
    for (const [x, y] of r.pts) { shp.setFloat64(c, x, true); shp.setFloat64(c + 8, y, true); c += 16; }
    o += 8 + r.contentLen;
  });
  const propKeys = [...new Set(features.flatMap((f) => Object.keys(f.properties ?? {})))].filter((k) => k !== 'id');
  const fields: Field[] = [
    { name: 'ID', type: 'C', length: 30, decimals: 0 },
    { name: 'SUPERFICIE', type: 'N', length: 15, decimals: 2 },
    ...propKeys.map((k) => ({ name: k.toUpperCase().slice(0, 10), type: 'C' as const, length: 80, decimals: 0 })),
  ];
  const rows = features.map((f) => {
    const row: Record<string, string | number> = { ID: f.id, SUPERFICIE: totalArea(f.polygons) };
    for (const k of propKeys) row[k.toUpperCase().slice(0, 10)] = String(f.properties?.[k] ?? '');
    return row;
  });
  return zipSync({
    [`${baseName}.shp`]: new Uint8Array(shp.buffer),
    [`${baseName}.shx`]: new Uint8Array(shx.buffer),
    [`${baseName}.dbf`]: dbf(rows, fields),
    [`${baseName}.prj`]: strToU8(esriPrj(epsg)),
    [`${baseName}.cpg`]: strToU8('UTF-8'),
  });
}
