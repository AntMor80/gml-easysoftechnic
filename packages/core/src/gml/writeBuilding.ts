import { orientPolygon, roundPolygon, totalArea } from '../geometry.js';
import { srsUri } from '../crs.js';
import type { Building, OtherConstruction, Polygon } from '../types.js';
import { esc, posList, timeStamp } from './xml.js';
import type { WriteOptions } from './writeParcel.js';

const NIL = 'xsi:nil="true" nilReason="other:unpopulated"';

function multiSurface(polys: Polygon[], id: string, srs: string, dec: number, allowInteriors: boolean): string {
  const ring = (r: [number, number][]) =>
    `<gml:LinearRing>\n<gml:posList srsDimension="2" count="${r.length}">${posList(r, dec)}</gml:posList>\n</gml:LinearRing>`;
  const members = polys
    .map((poly, i) => {
      const p = orientPolygon(roundPolygon(poly, dec));
      const ints = allowInteriors ? p.interiors.map((r) => `<gml:interior>\n${ring(r)}\n</gml:interior>`).join('\n') : '';
      return `<gml:surfaceMember>
<gml:Surface gml:id="Surface_${id}.${i + 1}" srsName="${srs}">
<gml:patches>
<gml:PolygonPatch>
<gml:exterior>
${ring(p.exterior)}
</gml:exterior>${ints ? '\n' + ints : ''}
</gml:PolygonPatch>
</gml:patches>
</gml:Surface>
</gml:surfaceMember>`;
    })
    .join('\n');
  return `<gml:MultiSurface gml:id="MultiSurface_${id}" srsName="${srs}">\n${members}\n</gml:MultiSurface>`;
}

function opt(tag: string, value: string | number | undefined, attrs = ''): string {
  return value === undefined ? `<${tag} ${NIL}></${tag}>` : `<${tag}${attrs}>${value}</${tag}>`;
}

export function buildingMemberXml(b: Building, opts: WriteOptions): string {
  const dec = opts.coordDecimals ?? 2;
  const srs = srsUri(opts.epsg);
  const fid = `ES.LOCAL.BU.${b.id}`;
  const date = b.dateOfConstruction
    ? `<bu-core2d:dateOfConstruction>
<bu-core2d:DateOfEvent>
<bu-core2d:end>${esc(b.dateOfConstruction)}T00:00:00</bu-core2d:end>
</bu-core2d:DateOfEvent>
</bu-core2d:dateOfConstruction>`
    : `<bu-core2d:dateOfConstruction ${NIL}></bu-core2d:dateOfConstruction>`;
  const use = b.currentUse
    ? `<bu-ext2d:currentUse>
<bu-ext2d:CurrentUse>
<bu-ext2d:currentUse xlink:href="http://inspire.ec.europa.eu/codelist/CurrentUseValue/${b.currentUse}"></bu-ext2d:currentUse>
<bu-ext2d:percentage ${NIL}></bu-ext2d:percentage>
</bu-ext2d:CurrentUse>
</bu-ext2d:currentUse>`
    : `<bu-ext2d:currentUse ${NIL}></bu-ext2d:currentUse>`;
  const gfa = b.grossFloorArea
    ? `<bu-ext2d:officialArea>
<bu-ext2d:OfficialArea>
<bu-ext2d:officialAreaReference xlink:href="http://inspire.ec.europa.eu/codelist/OfficialAreaReferenceValue/grossFloorArea"></bu-ext2d:officialAreaReference>
<bu-ext2d:value uom="m2">${b.grossFloorArea.toFixed(0)}</bu-ext2d:value>
</bu-ext2d:OfficialArea>
</bu-ext2d:officialArea>`
    : `<bu-ext2d:officialArea ${NIL}></bu-ext2d:officialArea>`;
  return `<member>
<bu-ext2d:Building gml:id="${esc(fid)}">
<bu-core2d:beginLifespanVersion ${NIL}></bu-core2d:beginLifespanVersion>
<bu-core2d:conditionOfConstruction>${b.conditionOfConstruction}</bu-core2d:conditionOfConstruction>
${date}
<bu-core2d:endLifespanVersion ${NIL}></bu-core2d:endLifespanVersion>
<bu-core2d:inspireId>
<Identifier xmlns="http://inspire.ec.europa.eu/schemas/base/3.3">
<localId>${esc(b.id)}</localId>
<namespace>ES.LOCAL.BU</namespace>
</Identifier>
</bu-core2d:inspireId>
<bu-ext2d:geometry>
<bu-core2d:BuildingGeometry>
<bu-core2d:geometry>
${multiSurface(b.polygons, fid, srs, dec, true)}
</bu-core2d:geometry>
<bu-core2d:horizontalGeometryEstimatedAccuracy uom="m" ${NIL}></bu-core2d:horizontalGeometryEstimatedAccuracy>
<bu-core2d:horizontalGeometryReference>footPrint</bu-core2d:horizontalGeometryReference>
<bu-core2d:referenceGeometry>true</bu-core2d:referenceGeometry>
</bu-core2d:BuildingGeometry>
</bu-ext2d:geometry>
${use}
${opt('bu-ext2d:numberOfBuildingUnits', b.numberOfBuildingUnits)}
${opt('bu-ext2d:numberOfDwellings', b.numberOfDwellings)}
<bu-ext2d:numberOfFloorsAboveGround>${b.numberOfFloorsAboveGround}</bu-ext2d:numberOfFloorsAboveGround>
${gfa}
</bu-ext2d:Building>
</member>`;
}

export function otherConstructionMemberXml(c: OtherConstruction, index: number, opts: WriteOptions): string {
  const dec = opts.coordDecimals ?? 2;
  const srs = srsUri(opts.epsg);
  const fid = `ES.LOCAL.OC.${c.id}.${index}`;
  return `<member>
<bu-ext2d:OtherConstruction gml:id="${esc(fid)}">
<bu-core2d:beginLifespanVersion ${NIL}></bu-core2d:beginLifespanVersion>
<bu-core2d:endLifespanVersion ${NIL}></bu-core2d:endLifespanVersion>
<bu-core2d:inspireId>
<Identifier xmlns="http://inspire.ec.europa.eu/schemas/base/3.3">
<localId>${esc(c.id)}.${index}</localId>
<namespace>ES.LOCAL.OC</namespace>
</Identifier>
</bu-core2d:inspireId>
<bu-ext2d:geometry>
${multiSurface(c.polygons, fid, srs, dec, false)}
</bu-ext2d:geometry>
<bu-ext2d:otherConstructionNature>swimmingPool</bu-ext2d:otherConstructionNature>
</bu-ext2d:OtherConstruction>
</member>`;
}

/**
 * Escribe un GML de edificio (INSPIRE Buildings 2D extendido) para el
 * Informe Catastral de Ubicación de las Construcciones (ICUC).
 * NOTA: la estructura sigue el modelo de la DG del Catastro; debe contrastarse
 * con GML de ejemplo validados en la Sede antes del lanzamiento (fase 4).
 */
export function writeBuildingGml(
  buildings: Building[],
  others: OtherConstruction[],
  opts: WriteOptions,
): string {
  const ts = opts.timeStamp ?? timeStamp();
  const n = buildings.length + others.length;
  const members = [
    ...buildings.map((b) => buildingMemberXml(b, opts)),
    ...others.map((c, i) => otherConstructionMemberXml(c, i + 1, opts)),
  ].join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!--Edificio generado con GML EasySoftechnic-->
<FeatureCollection xmlns="http://www.opengis.net/wfs/2.0" xmlns:bu-base="http://inspire.jrc.ec.europa.eu/schemas/bu-base/3.0" xmlns:bu-core2d="http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0" xmlns:bu-ext2d="http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/wfs/2.0 http://schemas.opengis.net/wfs/2.0/wfs.xsd http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0 http://inspire.ec.europa.eu/draft-schemas/bu-ext2d/2.0/BuildingExtended2D.xsd" timeStamp="${ts}" numberMatched="${n}" numberReturned="${n}">
${members}
</FeatureCollection>
`;
}

export function buildingFootprintArea(b: Building | OtherConstruction): number {
  return totalArea(b.polygons);
}
