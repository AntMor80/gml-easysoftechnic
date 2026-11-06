import { dxfToGeometry, readDxf } from '../io/dxf.js';
import { areaSummary, vertexTable, vertexTableCsv } from '../io/csv.js';
import { linesToPolygons, ringsToPolygons } from '../geometry.js';
import { writeParcelGml } from '../gml/writeParcel.js';
import { writeBuildingGml } from '../gml/writeBuilding.js';
import { validatePolygons } from '../validate.js';
import type { Building, Issue, Parcel, ParcelNamespace, Polygon } from '../types.js';

export interface DxfPackageOptions {
  epsg: number;
  /** Qué generar: parcela, edificio o ambos (cada uno de su capa). */
  parcel?: { layers?: string[]; id: string; namespace: ParcelNamespace };
  building?: { layers: string[]; data: Omit<Building, 'polygons'> };
  coordDecimals?: number;
  /** Tolerancia para unir líneas sueltas en recintos (m). */
  snap?: number;
}

export interface DxfPackage {
  files: { name: string; mime: string; content: string }[];
  issues: Issue[];
  summary: ReturnType<typeof areaSummary>;
  ignored: Record<string, number>;
  layers: string[];
}

function polysFromLayers(dxf: ReturnType<typeof readDxf>, layers: string[] | undefined, snap: number) {
  const { rings, lines } = dxfToGeometry(dxf, layers);
  const fromLines = linesToPolygons(lines, snap);
  return { polygons: [...ringsToPolygons(rings), ...fromLines.polygons], open: fromLines.open.length };
}

/**
 * Del DXF al paquete para el trámite en el Catastro:
 * GML de parcela y/o edificio, CSV de coordenadas y resumen de superficies.
 * Los informes PDF y Word se generan después con el módulo de informes.
 */
export function dxfToCatastroPackage(dxfText: string, opts: DxfPackageOptions): DxfPackage {
  const dxf = readDxf(dxfText);
  const snap = opts.snap ?? 0.01;
  const files: DxfPackage['files'] = [];
  const issues: Issue[] = [];
  const items: { id: string; polygons: Polygon[] }[] = [];

  if (opts.parcel) {
    const { polygons, open } = polysFromLayers(dxf, opts.parcel.layers, snap);
    if (open) issues.push({ code: 'OPEN_LINES', severity: 'warning', message: `${open} línea(s) de la parcela no forman un recinto cerrado y se han ignorado.` });
    issues.push(...validatePolygons(polygons));
    const parcel: Parcel = { id: opts.parcel.id, namespace: opts.parcel.namespace, polygons };
    files.push({ name: `${opts.parcel.id}_parcela.gml`, mime: 'application/gml+xml', content: writeParcelGml([parcel], { epsg: opts.epsg, coordDecimals: opts.coordDecimals }) });
    items.push({ id: opts.parcel.id, polygons });
  }
  if (opts.building) {
    const { polygons, open } = polysFromLayers(dxf, opts.building.layers, snap);
    if (open) issues.push({ code: 'OPEN_LINES', severity: 'warning', message: `${open} línea(s) del edificio no forman un recinto cerrado y se han ignorado.` });
    issues.push(...validatePolygons(polygons));
    const b: Building = { ...opts.building.data, polygons };
    files.push({ name: `${b.id}_edificio.gml`, mime: 'application/gml+xml', content: writeBuildingGml([b], [], { epsg: opts.epsg, coordDecimals: opts.coordDecimals }) });
    items.push({ id: `${b.id}_edificio`, polygons });
  }
  const rows = vertexTable(items);
  files.push({ name: 'coordenadas.csv', mime: 'text/csv', content: vertexTableCsv(rows, { decimals: opts.coordDecimals ?? 2, epsg: opts.epsg }) });
  return { files, issues, summary: areaSummary(items), ignored: dxf.ignored, layers: dxf.layers };
}
