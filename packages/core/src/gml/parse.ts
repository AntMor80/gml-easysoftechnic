import { XMLParser } from 'fast-xml-parser';
import { closeRing, totalArea } from '../geometry.js';
import { parseSrsName } from '../crs.js';
import type { Point, Polygon, Ring } from '../types.js';

export type FeatureKind = 'CadastralParcel' | 'Building' | 'OtherConstruction' | 'BuildingPart' | 'Unknown';

export interface GmlFeature {
  kind: FeatureKind;
  gmlId?: string;
  localId?: string;
  namespace?: string;
  polygons: Polygon[];
  /** Superficie declarada en el archivo (areaValue), si existe. */
  declaredArea?: number;
  /** Superficie calculada de la geometría. */
  computedArea: number;
  attributes: Record<string, string>;
}

export interface ParsedGml {
  /** Versión INSPIRE detectada: 3 (cp/3.0, bu 2.0 antiguos) o 4 (cp/4.0). */
  version: 3 | 4 | undefined;
  epsg?: number;
  features: GmlFeature[];
  warnings: string[];
}

const FEATURE_TAGS: FeatureKind[] = ['CadastralParcel', 'Building', 'OtherConstruction', 'BuildingPart'];

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) =>
    ['member', 'featureMember', 'surfaceMember', 'interior', 'PolygonPatch', 'polygonMember', 'pos'].includes(name),
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as Node)) return String((v as Node)['#text']);
  return undefined;
}

function numbers(s: string): number[] {
  return s
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
}

function readRing(lr: Node | undefined, swap: boolean): Ring | undefined {
  if (!lr) return undefined;
  let nums: number[] = [];
  const pl = text(lr['posList']);
  if (pl) nums = numbers(pl);
  else if (lr['pos']) nums = asArray(lr['pos'] as unknown[]).flatMap((p) => numbers(text(p) ?? ''));
  else if (lr['coordinates']) nums = numbers(text(lr['coordinates']) ?? '');
  const dim = Number((lr['posList'] as Node | undefined)?.['@srsDimension'] ?? 2) || 2;
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += dim) {
    const a = nums[i]!;
    const b = nums[i + 1]!;
    pts.push(swap ? [b, a] : [a, b]);
  }
  return pts.length ? closeRing(pts) : undefined;
}

function boundaryRing(b: unknown, swap: boolean): Ring | undefined {
  const n = b as Node | undefined;
  if (!n) return undefined;
  return readRing(n['LinearRing'] as Node | undefined, swap);
}

function readPolygonLike(p: Node, swap: boolean): Polygon | undefined {
  const exterior = boundaryRing(p['exterior'] ?? p['outerBoundaryIs'], swap);
  if (!exterior) return undefined;
  const interiors = [...asArray(p['interior'] as unknown[]), ...asArray(p['innerBoundaryIs'] as unknown[])]
    .map((i) => boundaryRing(i, swap))
    .filter((r): r is Ring => !!r);
  return { exterior, interiors };
}

/** Busca recursivamente todas las superficies (Surface/PolygonPatch o Polygon). */
function collectPolygons(node: unknown, swap: boolean, out: Polygon[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectPolygons(n, swap, out));
    return;
  }
  const n = node as Node;
  for (const [key, value] of Object.entries(n)) {
    if (key.startsWith('@')) continue;
    if (key === 'PolygonPatch') {
      asArray(value as Node[]).forEach((pp) => {
        const poly = readPolygonLike(pp, swap);
        if (poly) out.push(poly);
      });
    } else if (key === 'Polygon') {
      asArray(value as Node[]).forEach((pp) => {
        const poly = readPolygonLike(pp, swap);
        if (poly) out.push(poly);
      });
    } else {
      collectPolygons(value, swap, out);
    }
  }
}

function findSrs(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as Node;
  if (typeof n['@srsName'] === 'string') return n['@srsName'] as string;
  for (const [k, v] of Object.entries(n)) {
    if (k.startsWith('@')) continue;
    const r = findSrs(v);
    if (r) return r;
  }
  return undefined;
}

function findFeatures(node: unknown, out: { kind: FeatureKind; node: Node }[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => findFeatures(n, out));
    return;
  }
  for (const [k, v] of Object.entries(node as Node)) {
    if (k.startsWith('@')) continue;
    if ((FEATURE_TAGS as string[]).includes(k)) {
      asArray(v as Node[]).forEach((f) => out.push({ kind: k as FeatureKind, node: f }));
    } else {
      findFeatures(v, out);
    }
  }
}

function simpleAttributes(node: Node): Record<string, string> {
  const attrs: Record<string, string> = {};
  const walk = (n: unknown, prefix: string) => {
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n as Node)) {
      if (k.startsWith('@') || k === 'geometry' || k === 'Identifier') continue;
      const t = text(v);
      if (t !== undefined && t !== '') attrs[prefix + k] = t;
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const href = (v as Node)['@href'];
        if (typeof href === 'string') attrs[prefix + k] = href.split('/').pop() ?? href;
        else walk(v, prefix);
      }
    }
  };
  walk(node, '');
  return attrs;
}

/** Lee un GML de parcela o de edificio (INSPIRE v3 o v4) y devuelve sus elementos. */
export function parseGml(xml: string): ParsedGml {
  const warnings: string[] = [];
  const doc = parser.parse(xml) as Node;
  let version: 3 | 4 | undefined;
  if (/schemas\/cp\/4\.0/.test(xml)) version = 4;
  else if (/schemas\/cp\/3\.0|CadastralParcels\/3\.0|cp\/3\.0/.test(xml)) version = 3;
  else if (/bu-ext2d\/2\.0|bu-core2d\/2\.0/.test(xml)) version = 4;

  const epsg = parseSrsName(findSrs(doc));
  if (!epsg) warnings.push('No se ha encontrado el sistema de referencia (srsName).');
  // En GML 3.2 los códigos geográficos EPSG van en orden latitud, longitud.
  const swap = epsg === 4258 || epsg === 4326;

  const found: { kind: FeatureKind; node: Node }[] = [];
  findFeatures(doc, found);
  const features: GmlFeature[] = found.map(({ kind, node }) => {
    const polygons: Polygon[] = [];
    collectPolygons(node['geometry'] ?? node, swap, polygons);
    const idNode = (node['inspireId'] as Node | undefined)?.['Identifier'] as Node | undefined;
    const area = text(node['areaValue']);
    if (area && area.includes(',')) {
      warnings.push(`La superficie declarada (${area}) usa coma decimal; el esquema del Catastro exige punto. Se corregirá al reescribir el GML.`);
    }
    const gmlId = node['@id'] as string | undefined;
    const ns = text(idNode?.['namespace']);
    const lid = text(idNode?.['localId']);
    if (gmlId && ns && lid && gmlId !== `${ns}.${lid}`) {
      warnings.push(`El identificador gml:id "${gmlId}" no coincide con el espacio de nombres y el localId (${ns}.${lid}).`);
    }
    return {
      kind,
      gmlId: node['@id'] as string | undefined,
      localId: text(idNode?.['localId']),
      namespace: text(idNode?.['namespace']),
      polygons,
      declaredArea: area !== undefined ? Number(area.replace(',', '.')) : undefined,
      computedArea: totalArea(polygons),
      attributes: simpleAttributes(node),
    };
  });
  if (features.length === 0) warnings.push('El archivo no contiene parcelas ni edificios reconocibles.');
  return { version, epsg, features, warnings };
}
