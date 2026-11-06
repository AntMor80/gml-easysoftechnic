import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeFileSync, mkdirSync } from 'node:fs';
import { toGeoJson, fromGeoJson, toKml, toKmz, toShapefileZip, coordinatesWorkbook, esriPrj } from '../src/index.js';
import type { Ring } from '../src/types.js';

const square = (x: number, y: number, s: number): Ring => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const feats = [
  { id: '1234567VK1213S', polygons: [{ exterior: square(440000, 4474000, 20), interiors: [square(440005, 4474005, 5)] }], properties: { uso: 'Residencial' } },
  { id: 'PARCELA_2', polygons: [{ exterior: square(440030, 4474000, 10), interiors: [] }] },
];

describe('exportación', () => {
  it('GeoJSON en WGS84 y vuelta a UTM', () => {
    const gj = JSON.parse(toGeoJson(feats, 25830));
    expect(gj.features).toHaveLength(2);
    expect(gj.features[0].properties.superficie_m2).toBe(375);
    const [lon, lat] = gj.features[0].geometry.coordinates[0][0][0];
    expect(lon).toBeCloseTo(-3.7, 1);
    expect(lat).toBeCloseTo(40.42, 1);
    const back = fromGeoJson(toGeoJson(feats, 25830), 25830);
    expect(back[0]!.polygons[0]!.exterior[0]![0]).toBeCloseTo(440000, 2);
  });

  it('KML y KMZ', () => {
    const kml = toKml(feats, 25830);
    expect(kml).toContain('<name>1234567VK1213S</name>');
    expect(kml).toContain('innerBoundaryIs');
    expect(Object.keys(unzipSync(toKmz(feats, 25830)))).toEqual(['doc.kml']);
  });

  it('Shapefile completo con proyección', () => {
    const zip = unzipSync(toShapefileZip(feats, 25830, 'parcelas'));
    expect(Object.keys(zip).sort()).toEqual(['parcelas.cpg', 'parcelas.dbf', 'parcelas.prj', 'parcelas.shp', 'parcelas.shx']);
    expect(strFromU8(zip['parcelas.prj']!)).toContain('ETRS_1989_UTM_Zone_30N');
    expect(esriPrj(25829)).toContain('Central_Meridian",-9.0');
    const dir = 'test/.out';
    mkdirSync(dir, { recursive: true });
    for (const [n, b] of Object.entries(zip)) writeFileSync(`${dir}/${n}`, b);
  });

  it('Excel de coordenadas', () => {
    const xlsx = unzipSync(coordinatesWorkbook(feats, 25830));
    expect(Object.keys(xlsx)).toContain('xl/worksheets/sheet2.xml');
    writeFileSync('test/.out/coordenadas.xlsx', coordinatesWorkbook(feats, 25830));
  });
});

import initSqlJs from 'sql.js';
import { toGeoPackage } from '../src/index.js';

describe('GeoPackage', () => {
  it('crea una capa de polígonos legible', async () => {
    const SQL = await initSqlJs();
    const bytes = toGeoPackage(SQL, feats, 25830, 'parcelas');
    writeFileSync('test/.out/parcelas.gpkg', bytes);
    const db = new SQL.Database(bytes);
    const rows = db.exec('SELECT id, superficie, uso FROM parcelas ORDER BY fid')[0]!.values;
    expect(rows).toEqual([['1234567VK1213S', 375, 'Residencial'], ['PARCELA_2', 100, null]]);
    expect(db.exec("SELECT srs_id FROM gpkg_geometry_columns")[0]!.values[0]![0]).toBe(25830);
  });
});
