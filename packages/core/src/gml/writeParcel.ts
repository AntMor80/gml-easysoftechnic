import { orientPolygon, roundPolygon, totalArea } from '../geometry.js';
import { srsUri } from '../crs.js';
import type { Parcel, Polygon } from '../types.js';
import { esc, posList, timeStamp } from './xml.js';

export interface WriteOptions {
  epsg: number;
  /** Decimales de coordenadas (el Catastro recomienda 2). */
  coordDecimals?: number;
  /** Decimales de superficie (0 a 4). */
  areaDecimals?: number;
  timeStamp?: string;
}

function surfaceXml(poly: Polygon, id: string, idx: number, srs: string, dec: number): string {
  const p = orientPolygon(roundPolygon(poly, dec));
  const ring = (r: [number, number][]) =>
    `<gml:LinearRing>\n<gml:posList srsDimension="2" count="${r.length}">${posList(r, dec)}</gml:posList>\n</gml:LinearRing>`;
  const interiors = p.interiors.map((r) => `<gml:interior>\n${ring(r)}\n</gml:interior>`).join('\n');
  return `<gml:surfaceMember>
<gml:Surface gml:id="Surface_${id}.${idx}" srsName="${srs}">
<gml:patches>
<gml:PolygonPatch>
<gml:exterior>
${ring(p.exterior)}
</gml:exterior>${interiors ? '\n' + interiors : ''}
</gml:PolygonPatch>
</gml:patches>
</gml:Surface>
</gml:surfaceMember>`;
}

export function parcelMemberXml(parcel: Parcel, opts: WriteOptions): string {
  const dec = opts.coordDecimals ?? 2;
  const adec = opts.areaDecimals ?? 0;
  const srs = srsUri(opts.epsg);
  const fid = `${parcel.namespace}.${parcel.id}`;
  const area = parcel.area ?? totalArea(parcel.polygons.map((p) => roundPolygon(p, dec)));
  const isRc = parcel.namespace === 'ES.SDGC.CP';
  const surfaces = parcel.polygons.map((p, i) => surfaceXml(p, fid, i + 1, srs, dec)).join('\n');
  return `<member>
<cp:CadastralParcel gml:id="${esc(fid)}">
<cp:areaValue uom="m2">${area.toFixed(adec)}</cp:areaValue>
<cp:beginLifespanVersion xsi:nil="true" nilReason="other:unpopulated"></cp:beginLifespanVersion>
<cp:endLifespanVersion xsi:nil="true" nilReason="other:unpopulated"></cp:endLifespanVersion>
<cp:geometry>
<gml:MultiSurface gml:id="MultiSurface_${esc(fid)}" srsName="${srs}">
${surfaces}
</gml:MultiSurface>
</cp:geometry>
<cp:inspireId>
<Identifier xmlns="http://inspire.ec.europa.eu/schemas/base/3.3">
<localId>${esc(parcel.id)}</localId>
<namespace>${parcel.namespace}</namespace>
</Identifier>
</cp:inspireId>
<cp:label>${esc(parcel.label ?? '')}</cp:label>
<cp:nationalCadastralReference>${isRc ? esc(parcel.id) : ''}</cp:nationalCadastralReference>
</cp:CadastralParcel>
</member>`;
}

/**
 * Escribe un GML de parcela catastral (INSPIRE CadastralParcels 4.0),
 * con el formato que acepta la Sede Electrónica del Catastro.
 * Admite varias parcelas (multiparcela) y parcelas de varios recintos con islas.
 */
export function writeParcelGml(parcels: Parcel[], opts: WriteOptions): string {
  const ts = opts.timeStamp ?? timeStamp();
  const members = parcels.map((p) => parcelMemberXml(p, opts)).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!--Parcela Catastral generada con GML EasySoftechnic-->
<FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://inspire.ec.europa.eu/schemas/cp/4.0 http://inspire.ec.europa.eu/schemas/cp/4.0/CadastralParcels.xsd" xmlns="http://www.opengis.net/wfs/2.0" timeStamp="${ts}" numberMatched="${parcels.length}" numberReturned="${parcels.length}">
${members}
</FeatureCollection>
`;
}
