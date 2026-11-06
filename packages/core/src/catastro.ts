import { XMLParser } from 'fast-xml-parser';
import { parseGml } from './gml/parse.js';
import type { Polygon } from './types.js';

export * from './catastroUrls.js';

export interface CatastroParcel {
  refcat: string;
  polygons: Polygon[];
  area?: number;
}

/** Datos públicos de un inmueble o parcela (Consulta_DNPRC). */
export interface CatastroData {
  refcat: string;
  direccion?: string;
  uso?: string;
  superficie?: number;
  superficieConstruida?: number;
  anoConstruccion?: number;
  clase?: 'Urbano' | 'Rústico';
  /** Número de inmuebles cuando la referencia de 14 caracteres tiene varios (división horizontal). */
  inmuebles?: number;
}

const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

type N = Record<string, unknown>;
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** Busca recursivamente la primera aparición de una etiqueta. */
function find(node: unknown, tag: string): unknown {
  if (!node || typeof node !== 'object') return undefined;
  const o = node as N;
  if (tag in o) return o[tag];
  for (const v of Object.values(o)) {
    const r = find(v, tag);
    if (r !== undefined) return r;
  }
  return undefined;
}

function serviceError(doc: unknown): string | undefined {
  const err = find(doc, 'err');
  const des = err ? find(err, 'des') : undefined;
  return des ? String(des) : undefined;
}

/** Respuesta del WFS INSPIRE (GetParcel / GetNeighbourParcel) → parcelas. */
export function parseCatastroParcels(text: string): CatastroParcel[] {
  if (/ExceptionReport|ows:Exception/.test(text)) {
    const m = /<(?:ows:)?ExceptionText>([\s\S]*?)<\/(?:ows:)?ExceptionText>/.exec(text);
    throw new Error(`El Catastro responde: ${m?.[1]?.trim() || 'error en la consulta'}`);
  }
  const g = parseGml(text);
  return g.features.filter((f) => f.kind === 'CadastralParcel').map((f) => ({ refcat: f.localId ?? f.gmlId ?? '', polygons: f.polygons, area: f.declaredArea ?? f.computedArea }));
}

const USOS: Record<string, string> = {
  V: 'Residencial', A: 'Almacén-estacionamiento', I: 'Industrial', O: 'Oficinas', C: 'Comercial', K: 'Deportivo',
  T: 'Espectáculos', G: 'Ocio y hostelería', Y: 'Sanidad y beneficencia', E: 'Cultural', R: 'Religioso',
  M: 'Obras de urbanización, jardinería, suelos sin edificar', P: 'Edificio singular', B: 'Almacén agrario',
  J: 'Industrial agrario', Z: 'Agrario',
};

/** Respuesta de Consulta_DNPRC → datos públicos. */
export function parseCatastroData(text: string, refcat: string): CatastroData {
  const doc = xml.parse(text);
  const err = serviceError(doc);
  if (err) throw new Error(`El Catastro responde: ${err}`);
  const out: CatastroData = { refcat };
  const lista = find(doc, 'lrcdnp');
  if (lista) {
    const items = arr(find(lista, 'rcdnp') as N | N[]);
    out.inmuebles = items.length;
    const dt = items[0] ? find(items[0], 'ldt') : undefined;
    if (dt) out.direccion = String(dt);
  }
  const bi = find(doc, 'bi');
  if (bi) {
    const ldt = find(bi, 'ldt');
    if (ldt) out.direccion = String(ldt);
    const debi = find(bi, 'debi') as N | undefined;
    if (debi) {
      const luso = debi.luso ?? debi.uso;
      if (luso) out.uso = USOS[String(luso)] ?? String(luso);
      if (debi.sfc) out.superficieConstruida = Number(String(debi.sfc).replace(',', '.'));
      if (debi.ant) out.anoConstruccion = Number(debi.ant);
    }
    const cn = find(bi, 'cn');
    if (cn) out.clase = String(cn) === 'RU' ? 'Rústico' : 'Urbano';
  }
  const ssf = find(doc, 'ssf') ?? find(find(doc, 'finca'), 'ssf');
  if (ssf) out.superficie = Number(String(ssf).replace(',', '.'));
  return out;
}

/** Respuesta de Consulta_RCCOOR → referencia catastral de la parcela en ese punto. */
export function parseCatastroPoint(text: string): { refcat: string; direccion?: string } {
  const doc = xml.parse(text);
  const err = serviceError(doc);
  if (err) throw new Error(`El Catastro responde: ${err}`);
  const pc1 = find(doc, 'pc1');
  const pc2 = find(doc, 'pc2');
  if (!pc1 || !pc2) throw new Error('No hay ninguna parcela catastral en ese punto');
  const ldt = find(doc, 'ldt');
  return { refcat: `${String(pc1)}${String(pc2)}`, direccion: ldt ? String(ldt) : undefined };
}
