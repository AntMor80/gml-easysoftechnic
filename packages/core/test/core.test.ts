import { describe, expect, it } from 'vitest';
import {
  closeRing, signedArea, polygonArea, orientPolygon, linesToPolygons, polygonsToLines,
  selfIntersections, chordLengthForRadius, writeParcelGml, parseGml, convertParcelGmlToV4,
  validatePolygons, validateBuildingInParcel, parseCoordinateText, readDxf, dxfToGeometry,
  writeDxf, vertexTable, vertexTableCsv, writeBuildingGml, transformPoint, helmert2D,
  isValidCadastralReference, dxfToCatastroPackage,
} from '../src/index.js';
import type { Polygon, Ring } from '../src/types.js';

const square = (x: number, y: number, s: number): Ring => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const cw = (r: Ring): Ring => r.slice().reverse();

describe('geometría', () => {
  it('calcula superficies y orientación', () => {
    expect(signedArea(square(0, 0, 10))).toBe(100);
    expect(signedArea(cw(square(0, 0, 10)))).toBe(-100);
    const p: Polygon = { exterior: cw(square(0, 0, 10)), interiors: [square(2, 2, 2)] };
    const o = orientPolygon(p);
    expect(signedArea(o.exterior)).toBeGreaterThan(0);
    expect(signedArea(o.interiors[0]!)).toBeLessThan(0);
    expect(polygonArea(o)).toBe(96);
  });

  it('cierra anillos abiertos', () => {
    expect(closeRing([[0, 0], [1, 0], [1, 1]])).toHaveLength(4);
  });

  it('detecta autointersecciones (pajarita)', () => {
    expect(selfIntersections([[0, 0], [10, 10], [10, 0], [0, 10], [0, 0]]).length).toBeGreaterThan(0);
    expect(selfIntersections(square(0, 0, 5))).toHaveLength(0);
  });

  it('convierte líneas sueltas en superficies con islas y al revés', () => {
    const lines = [
      [[0, 0], [10, 0]], [[10, 0], [10, 10]], [[0, 10], [10, 10]], [[0, 10], [0, 0.005]],
      [[3, 3], [6, 3], [6, 6], [3, 6], [3, 3]],
      [[20, 20], [21, 21]],
    ] as Ring[];
    const { polygons, open } = linesToPolygons(lines);
    expect(polygons).toHaveLength(1);
    expect(polygons[0]!.interiors).toHaveLength(1);
    expect(polygonArea(polygons[0]!)).toBeCloseTo(91, 1);
    expect(open).toHaveLength(1);
    expect(polygonsToLines(polygons)).toHaveLength(2);
  });

  it('separación de vértices en curvas según el Catastro (flecha 2 cm)', () => {
    // la tabla del Catastro da 0,3 m para 1 m de radio y 3 m por encima de 60 m
    expect(chordLengthForRadius(1)).toBeGreaterThan(0.3);
    expect(chordLengthForRadius(60)).toBeGreaterThan(3);
  });
});

describe('GML de parcela', () => {
  const parcel = { id: '1234567VK1213S', namespace: 'ES.SDGC.CP' as const, polygons: [{ exterior: cw(square(442000, 4473000, 20)), interiors: [] }] };

  it('escribe un GML v4 con exterior antihorario y superficie', () => {
    const xml = writeParcelGml([parcel], { epsg: 25830, timeStamp: '2026-11-06T00:00:00' });
    expect(xml).toContain('http://inspire.ec.europa.eu/schemas/cp/4.0');
    expect(xml).toContain('<cp:areaValue uom="m2">400</cp:areaValue>');
    expect(xml).toContain('srsName="http://www.opengis.net/def/crs/EPSG/0/25830"');
    expect(xml).toContain('<gml:posList srsDimension="2" count="5">442000.00 4473000.00 442020.00 4473000.00');
    expect(xml).toContain('<cp:nationalCadastralReference>1234567VK1213S</cp:nationalCadastralReference>');
  });

  it('lee lo que escribe (ida y vuelta)', () => {
    const xml = writeParcelGml([parcel], { epsg: 25830 });
    const parsed = parseGml(xml);
    expect(parsed.version).toBe(4);
    expect(parsed.epsg).toBe(25830);
    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0]!.localId).toBe('1234567VK1213S');
    expect(parsed.features[0]!.computedArea).toBeCloseTo(400);
  });

  it('convierte un GML v3 a v4', () => {
    const v3 = `<?xml version="1.0"?><gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:cp="urn:x-inspire:specification:gmlas:CadastralParcels:3.0" xmlns:base="urn:x-inspire:specification:gmlas:BaseTypes:3.2"><gml:featureMember><cp:CadastralParcel gml:id="ES.SDGC.CP.PARC1"><cp:areaValue uom="m2">100</cp:areaValue><cp:geometry><gml:MultiSurface gml:id="ms" srsName="urn:ogc:def:crs:EPSG::25830"><gml:surfaceMember><gml:Surface gml:id="s1" srsName="urn:ogc:def:crs:EPSG::25830"><gml:patches><gml:PolygonPatch><gml:exterior><gml:LinearRing><gml:posList srsDimension="2">0 0 0 10 10 10 10 0 0 0</gml:posList></gml:LinearRing></gml:exterior></gml:PolygonPatch></gml:patches></gml:Surface></gml:surfaceMember></gml:MultiSurface></cp:geometry><cp:inspireId><base:Identifier><base:localId>PARC1</base:localId><base:namespace>ES.SDGC.CP</base:namespace></base:Identifier></cp:inspireId></cp:CadastralParcel></gml:featureMember></gml:FeatureCollection>`;
    const r = convertParcelGmlToV4(v3);
    expect(r.parcels[0]!.id).toBe('PARC1');
    const back = parseGml(r.xml);
    expect(back.version).toBe(4);
    expect(signedArea(back.features[0]!.polygons[0]!.exterior)).toBeGreaterThan(0);
  });
});

describe('GML de edificio', () => {
  it('escribe edificio y piscina con atributos', () => {
    const xml = writeBuildingGml(
      [{ id: '1234567VK1213S', polygons: [{ exterior: square(0, 0, 10), interiors: [] }], numberOfFloorsAboveGround: 2, conditionOfConstruction: 'functional', currentUse: '1_residential', numberOfDwellings: 1 }],
      [{ id: '1234567VK1213S', polygons: [{ exterior: square(12, 0, 4), interiors: [] }] }],
      { epsg: 25830 },
    );
    expect(xml).toContain('<bu-ext2d:numberOfFloorsAboveGround>2</bu-ext2d:numberOfFloorsAboveGround>');
    expect(xml).toContain('CurrentUseValue/1_residential');
    expect(xml).toContain('OtherConstruction');
    expect(parseGml(xml).features.map((f) => f.kind)).toEqual(['Building', 'OtherConstruction']);
  });
});

describe('validación previa', () => {
  it('detecta solapes, pocos vértices y construcción fuera de parcela', () => {
    const a: Polygon = { exterior: square(0, 0, 10), interiors: [] };
    const b: Polygon = { exterior: square(5, 5, 10), interiors: [] };
    const c: Polygon = { exterior: square(10, 0, 10), interiors: [] }; // colindante, no solapa
    const codes = (p: Polygon[]) => validatePolygons(p).map((i) => i.code);
    expect(codes([a, b])).toContain('OVERLAP');
    expect(codes([a, c])).not.toContain('OVERLAP');
    expect(codes([{ exterior: [[0, 0], [1, 0], [0, 0]], interiors: [] }])).toContain('TOO_FEW_VERTICES');
    expect(validateBuildingInParcel([{ exterior: square(8, 8, 4), interiors: [] }], [a])).toHaveLength(1);
    expect(validateBuildingInParcel([{ exterior: square(1, 1, 8.003), interiors: [] }], [a], 0.005)).toHaveLength(0);
  });

  it('valida el formato de la referencia catastral', () => {
    expect(isValidCadastralReference('1234567VK1213S')).toBe(true);
    expect(isValidCadastralReference('1234567VK1213S0001AB')).toBe(true);
    expect(isValidCadastralReference('123')).toBe(false);
  });
});

describe('entrada de coordenadas y DXF', () => {
  it('lee la salida del comando LIST de AutoCAD y TXT con separador', () => {
    const list = `LWPOLYLINE  Capa: "0"\n en el punto  X= 442000.0000  Y=4473000.0000  Z=    0.0000\n en el punto  X= 442010.0000  Y=4473000.0000  Z=    0.0000\n en el punto  X= 442010.0000  Y=4473010.0000  Z=    0.0000`;
    expect(parseCoordinateText(list)[0]).toHaveLength(4);
    const txt = `0 0\n10 0\n10 10\nseparador\n20 20\n30 20\n30 30`;
    expect(parseCoordinateText(txt)).toHaveLength(2);
  });

  it('lee y escribe DXF (polilínea con arco y líneas sueltas)', () => {
    const dxf = writeDxf([{ layer: 'PARCELA', rings: [square(0, 0, 10)] }]);
    const back = readDxf(dxf);
    expect(back.layers).toEqual(['PARCELA']);
    const g = dxfToGeometry(back);
    expect(g.rings).toHaveLength(1);
    // LWPOLYLINE con semicírculo (bulge = 1) entre (0,0) y (10,0)
    const lw = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', '0', '90', '2', '70', '1', '10', '0', '20', '0', '42', '1', '10', '10', '20', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const arc = readDxf(lw).entities[0]!;
    expect(arc.points.length).toBeGreaterThan(10);
    const area = Math.abs(signedArea(closeRing(arc.points)));
    expect(area).toBeCloseTo((Math.PI * 25) / 2, 0);
  });

  it('del DXF al paquete del Catastro: GML + CSV', () => {
    const dxf = writeDxf([
      { layer: 'PARCELA', rings: [square(442000, 4473000, 30)] },
      { layer: 'EDIFICIO', rings: [square(442005, 4473005, 10)] },
    ]);
    const pkg = dxfToCatastroPackage(dxf, {
      epsg: 25830,
      parcel: { layers: ['PARCELA'], id: '1234567VK1213S', namespace: 'ES.SDGC.CP' },
      building: { layers: ['EDIFICIO'], data: { id: '1234567VK1213S', numberOfFloorsAboveGround: 1, conditionOfConstruction: 'functional' } },
    });
    expect(pkg.files.map((f) => f.name)).toEqual(['1234567VK1213S_parcela.gml', '1234567VK1213S_edificio.gml', 'coordenadas.csv']);
    expect(pkg.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(pkg.summary[0]!.superficie).toBeCloseTo(900);
  });

  it('genera CSV de vértices para Excel', () => {
    const rows = vertexTable([{ id: 'P1', polygons: [{ exterior: square(0, 0, 10), interiors: [] }] }]);
    expect(rows).toHaveLength(4);
    const csv = vertexTableCsv(rows);
    expect(csv).toContain('Recinto;Anillo;Vértice;X (m);Y (m);Lado (m)');
    expect(csv).toContain('P1;exterior;1;0,00;0,00;10,00');
  });
});

describe('coordenadas', () => {
  it('transforma ETRS89 UTM 30N a geográficas y vuelta', () => {
    const p: [number, number] = [440000, 4474000];
    const g = transformPoint(p, 25830, 4258);
    expect(g[0]).toBeCloseTo(-3.7, 1);
    expect(g[1]).toBeCloseTo(40.42, 1);
    const back = transformPoint(g, 4258, 25830);
    expect(back[0]).toBeCloseTo(p[0], 3);
  });

  it('corrige catastro desplazado con pares de puntos', () => {
    const h = helmert2D([{ from: [0, 0], to: [1.5, -2] }, { from: [100, 0], to: [101.5, -2] }]);
    const r = h.apply([50, 50]);
    expect(r[0]).toBeCloseTo(51.5);
    expect(r[1]).toBeCloseTo(48);
  });
});
