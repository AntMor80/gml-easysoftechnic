import {
  dxfToGeometry, fromGeoJson, linesToPolygons, parseCoordinateText, parseGml, readDxf, ringsToPolygons,
} from '@gml/core';
import { uid, type Item, type Role } from './state';

export interface LoadResult {
  items: Item[];
  epsg?: number;
  warnings: string[];
}

/** Lee un archivo arrastrado o elegido y lo convierte en recintos. */
export async function loadFile(file: File, epsg: number): Promise<LoadResult> {
  const name = file.name;
  const ext = name.split('.').pop()?.toLowerCase();
  const text = await file.text();
  const base = name.replace(/\.[^.]+$/, '');
  if (ext === 'gml' || ext === 'xml') {
    const p = parseGml(text);
    return {
      epsg: p.epsg,
      warnings: p.warnings,
      items: p.features.map((f, i) => ({
        uid: uid(),
        // Identificadores genéricos (p. ej. "A" de ParCatGML) se sustituyen por el nombre del archivo.
        id: f.localId && f.localId.length >= 3 ? f.localId : p.features.length > 1 ? `${base}_${f.localId ?? i + 1}` : base,
        role: (f.kind === 'Building' ? 'edificio' : f.kind === 'OtherConstruction' ? 'piscina' : 'parcela') as Role,
        polygons: f.polygons,
        source: name,
        visible: true,
        attrs: f.attributes,
      })),
    };
  }
  if (ext === 'dxf') {
    const dxf = readDxf(text);
    const warnings = Object.entries(dxf.ignored).map(([t, c]) => `Se han ignorado ${c} entidad(es) ${t}.`);
    const items: Item[] = [];
    for (const layer of dxf.layers) {
      const g = dxfToGeometry(dxf, [layer]);
      const fromLines = linesToPolygons(g.lines);
      const polygons = [...ringsToPolygons(g.rings), ...fromLines.polygons];
      if (fromLines.open.length) warnings.push(`Capa ${layer}: ${fromLines.open.length} línea(s) abiertas sin cerrar.`);
      if (polygons.length) {
        const role: Role = /edif|constr|huella|build/i.test(layer) ? 'edificio' : /piscin/i.test(layer) ? 'piscina' : 'parcela';
        items.push({ uid: uid(), id: dxf.layers.length > 1 ? `${base}_${layer}` : base, role, polygons, source: `${name} · capa ${layer}`, visible: true });
      }
    }
    if (!items.length) warnings.push('El DXF no contiene polilíneas cerradas ni líneas que formen recintos.');
    return { items, warnings };
  }
  if (ext === 'geojson' || ext === 'json') {
    const feats = fromGeoJson(text, epsg);
    return { items: feats.map((f) => ({ uid: uid(), id: f.id, role: 'parcela' as Role, polygons: f.polygons, source: name, visible: true })), warnings: [] };
  }
  // TXT / CSV / salida de LIST de AutoCAD
  const rings = parseCoordinateText(text);
  if (!rings.length) return { items: [], warnings: [`No se han encontrado coordenadas en ${name}.`] };
  return { items: [{ uid: uid(), id: base, role: 'parcela', polygons: ringsToPolygons(rings), source: name, visible: true }], warnings: [] };
}
