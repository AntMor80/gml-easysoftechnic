import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseGml, validatePolygons, crossOverlaps, readDxf, dxfToGeometry, ringsToPolygons, totalArea, convertParcelGmlToV4, signedArea } from '../src/index.js';

// GML generados con el complemento ParCatGML de QGIS (dos viviendas adosadas),
// desplazados a una zona ficticia para no publicar ubicaciones reales.
const load = (n: string) => readFileSync(`test/fixtures/parcatgml_vivienda${n}.gml`, 'utf8');

describe('archivos reales (ParCatGML)', () => {
  const v24 = parseGml(load('24'));
  const v26 = parseGml(load('26'));

  it('lee superficie con coma decimal y avisa', () => {
    expect(v24.features[0]!.declaredArea).toBeCloseTo(58.02);
    expect(v24.features[0]!.computedArea).toBeCloseTo(58.02, 1);
    expect(v24.warnings.some((w) => w.includes('coma decimal'))).toBe(true);
    expect(v24.warnings.some((w) => w.includes('gml:id'))).toBe(true);
  });

  it('detecta el exterior en sentido horario de la vivienda 26 y lo corrige al reescribir', () => {
    expect(validatePolygons(v26.features[0]!.polygons).map((i) => i.code)).toContain('EXTERIOR_ORIENTATION');
    const fixed = parseGml(convertParcelGmlToV4(load('26')).xml);
    expect(signedArea(fixed.features[0]!.polygons[0]!.exterior)).toBeGreaterThan(0);
    expect(fixed.warnings).toHaveLength(0);
  });

  it('detecta el pequeño solape entre las dos viviendas adosadas', () => {
    const ov = crossOverlaps([
      { id: '24', polygons: v24.features[0]!.polygons },
      { id: '26', polygons: v26.features[0]!.polygons },
    ]);
    expect(ov).toHaveLength(1);
    expect(ov[0]!.area).toBeCloseTo(0.034, 3);
  });

  it.skipIf(!existsSync('test/fixtures/real/vivienda24.dxf'))('lee los DXF originales (AutoCAD 2018) con la misma superficie que el GML', () => {
    for (const [n, area] of [['24', 58.023], ['26', 63.567]] as const) {
      const g = dxfToGeometry(readDxf(readFileSync(`test/fixtures/real/vivienda${n}.dxf`, 'utf8')));
      expect(totalArea(ringsToPolygons(g.rings))).toBeCloseTo(area, 2);
    }
  });
});
