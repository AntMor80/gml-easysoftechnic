import type { SqlJsStatic } from 'sql.js';
import { bbox, closeRing, orientPolygon, totalArea } from '../geometry.js';
import { CRS_DEFS } from '../crs.js';
import { esriPrj } from './shapefile.js';
import type { ExportFeature } from './features.js';

/** WKB MultiPolygon (little endian). */
function wkbMultiPolygon(f: ExportFeature): Uint8Array {
  const polys = f.polygons.map(orientPolygon);
  const rings = polys.map((p) => [p.exterior, ...p.interiors].map((r) => closeRing(r)));
  const size = 9 + rings.reduce((s, pr) => s + 9 + pr.reduce((t, r) => t + 4 + r.length * 16, 0), 0);
  const dv = new DataView(new ArrayBuffer(size));
  let o = 0;
  const head = (type: number, n: number) => { dv.setUint8(o, 1); dv.setUint32(o + 1, type, true); dv.setUint32(o + 5, n, true); o += 9; };
  head(6, rings.length);
  for (const pr of rings) {
    head(3, pr.length);
    for (const r of pr) {
      dv.setUint32(o, r.length, true); o += 4;
      for (const [x, y] of r) { dv.setFloat64(o, x, true); dv.setFloat64(o + 8, y, true); o += 16; }
    }
  }
  return new Uint8Array(dv.buffer);
}

/** Geometría GeoPackage: cabecera GP + envolvente + WKB. */
function gpkgGeom(f: ExportFeature, srsId: number): Uint8Array {
  const wkb = wkbMultiPolygon(f);
  const env = bbox(f.polygons.flatMap((p) => p.exterior));
  const out = new Uint8Array(8 + 32 + wkb.length);
  const dv = new DataView(out.buffer);
  out[0] = 0x47; out[1] = 0x50; out[2] = 0; out[3] = 0b00000011; // envolvente XY, little endian
  dv.setInt32(4, srsId, true);
  dv.setFloat64(8, env[0], true); dv.setFloat64(16, env[2], true); dv.setFloat64(24, env[1], true); dv.setFloat64(32, env[3], true);
  out.set(wkb, 40);
  return out;
}

/**
 * GeoPackage (.gpkg) con una capa de polígonos. Necesita sql.js inicializado
 * (en el navegador con su archivo .wasm; en Node funciona directamente).
 */
export function toGeoPackage(SQL: SqlJsStatic, features: ExportFeature[], epsg: number, table = 'recintos'): Uint8Array {
  const db = new SQL.Database();
  const env = bbox(features.flatMap((f) => f.polygons.flatMap((p) => p.exterior)));
  const keys = [...new Set(features.flatMap((f) => Object.keys(f.properties ?? {})))].filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && k !== 'id');
  db.run('PRAGMA application_id = 1196444487; PRAGMA user_version = 10400;');
  db.run(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name));`);
  const srs = db.prepare('INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?)');
  srs.run(['Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', null]);
  srs.run(['Undefined geographic SRS', 0, 'NONE', 0, 'undefined', null]);
  srs.run(['WGS 84 geodetic', 4326, 'EPSG', 4326, esriPrj(4326), null]);
  if (epsg !== 4326) srs.run([CRS_DEFS[epsg]?.name ?? `EPSG:${epsg}`, epsg, 'EPSG', epsg, esriPrj(epsg), null]);
  srs.free();
  db.run(`CREATE TABLE "${table}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom MULTIPOLYGON, id TEXT, superficie REAL${keys.map((k) => `, "${k}" TEXT`).join('')})`);
  db.run('INSERT INTO gpkg_contents (table_name, data_type, identifier, min_x, min_y, max_x, max_y, srs_id) VALUES (?,?,?,?,?,?,?,?)', [table, 'features', table, env[0], env[1], env[2], env[3], epsg]);
  db.run('INSERT INTO gpkg_geometry_columns VALUES (?,?,?,?,0,0)', [table, 'geom', 'MULTIPOLYGON', epsg]);
  const ins = db.prepare(`INSERT INTO "${table}" (geom, id, superficie${keys.map((k) => `, "${k}"`).join('')}) VALUES (?,?,?${keys.map(() => ',?').join('')})`);
  for (const f of features) ins.run([gpkgGeom(f, epsg), f.id, totalArea(f.polygons), ...keys.map((k) => (f.properties?.[k] ?? null) as string | null)]);
  ins.free();
  const bytes = db.export();
  db.close();
  return bytes;
}
