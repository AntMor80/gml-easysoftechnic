import { coordinatesWorkbook, polygonsToLines, toGeoJson, toGeoPackage, toKml, toKmz, toShapefileZip, vertexTable, vertexTableCsv, writeDxf, ringsToText, type ExportFeature } from '@gml/core';
import type { State } from '../lib/state';
import { download } from '../lib/download';

async function sql() {
  const [{ default: init }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  return init({ locateFile: () => wasmUrl });
}

export function ExportPanel({ state }: { state: State }) {
  const items = state.items.filter((i) => i.visible);
  const feats: ExportFeature[] = items.map((i) => ({ id: i.id, polygons: i.polygons, properties: { tipo: i.role } }));
  const simple = items.map((i) => ({ id: i.id, polygons: i.polygons }));
  const E = state.epsg;
  const formats: { label: string; desc: string; run: () => void | Promise<void> }[] = [
    { label: 'DXF', desc: 'Polilíneas cerradas, una capa por tipo', run: () => download('recintos.dxf', writeDxf(['parcela', 'edificio', 'piscina', 'referencia'].map((r) => ({ layer: r.toUpperCase(), rings: polygonsToLines(items.filter((i) => i.role === r).flatMap((i) => i.polygons)) })).filter((g) => g.rings.length)), 'application/dxf') },
    { label: 'Shapefile (ZIP)', desc: 'SHP, SHX, DBF, PRJ', run: () => download('recintos_shp.zip', toShapefileZip(feats, E), 'application/zip') },
    { label: 'GeoPackage', desc: 'Una capa con atributos', run: async () => download('recintos.gpkg', toGeoPackage(await sql(), feats, E), 'application/geopackage+sqlite3') },
    { label: 'KML', desc: 'Google Earth', run: () => download('recintos.kml', toKml(feats, E), 'application/vnd.google-earth.kml+xml') },
    { label: 'KMZ', desc: 'KML comprimido', run: () => download('recintos.kmz', toKmz(feats, E), 'application/vnd.google-earth.kmz') },
    { label: 'GeoJSON', desc: 'WGS84 (web)', run: () => download('recintos.geojson', toGeoJson(feats, E), 'application/geo+json') },
    { label: 'GeoJSON UTM', desc: 'Coordenadas del proyecto, para QGIS', run: () => download('recintos_utm.geojson', toGeoJson(feats, E, { keepCrs: true }), 'application/geo+json') },
    { label: 'Excel', desc: 'Vértices y superficies', run: () => download('coordenadas.xlsx', coordinatesWorkbook(simple, E), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') },
    { label: 'CSV', desc: 'Separado por punto y coma', run: () => download('coordenadas.csv', vertexTableCsv(vertexTable(simple), { epsg: E }), 'text/csv') },
    { label: 'TXT', desc: 'Coordenadas con separador', run: () => download('coordenadas.txt', ringsToText(items.flatMap((i) => polygonsToLines(i.polygons))), 'text/plain') },
  ];
  return (
    <div className="panel">
      <p className="hint">Exporta los recintos visibles ({items.length}) en EPSG:{E}. La exportación es gratuita.</p>
      <div className="formats">
        {formats.map((f) => (
          <button key={f.label} disabled={!items.length} onClick={() => void f.run()}>
            <strong>{f.label}</strong>
            <span>{f.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
