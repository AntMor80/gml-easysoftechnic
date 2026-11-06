import { zipSync, strToU8 } from 'fflate';
import { closeRing, orientPolygon, totalArea } from '../geometry.js';
import { transformPolygon } from '../crs.js';
import { esc } from '../gml/xml.js';
import type { Ring } from '../types.js';
import type { ExportFeature } from './features.js';

const coords = (r: Ring) => closeRing(r).map(([x, y]) => `${x.toFixed(8)},${y.toFixed(8)},0`).join(' ');

/** KML para Google Earth (siempre en WGS84). */
export function toKml(features: ExportFeature[], epsg: number, name = 'GML EasySoftechnic'): string {
  const placemarks = features
    .map((ft) => {
      const polys = ft.polygons.map((p) => orientPolygon(transformPolygon(p, epsg, 4326)));
      const geom = polys
        .map(
          (p) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(p.exterior)}</coordinates></LinearRing></outerBoundaryIs>${p.interiors
            .map((h) => `<innerBoundaryIs><LinearRing><coordinates>${coords(h)}</coordinates></LinearRing></innerBoundaryIs>`)
            .join('')}</Polygon>`,
        )
        .join('');
      const extra = Object.entries(ft.properties ?? {})
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(String(v))}</value></Data>`)
        .join('');
      return `<Placemark><name>${esc(ft.id)}</name><styleUrl>#recinto</styleUrl><ExtendedData><Data name="superficie_m2"><value>${totalArea(ft.polygons).toFixed(2)}</value></Data>${extra}</ExtendedData><MultiGeometry>${geom}</MultiGeometry></Placemark>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>
<Style id="recinto"><LineStyle><color>ff0000ff</color><width>2</width></LineStyle><PolyStyle><color>400000ff</color></PolyStyle></Style>
${placemarks}
</Document></kml>
`;
}

export function toKmz(features: ExportFeature[], epsg: number, name?: string): Uint8Array {
  return zipSync({ 'doc.kml': strToU8(toKml(features, epsg, name)) });
}
