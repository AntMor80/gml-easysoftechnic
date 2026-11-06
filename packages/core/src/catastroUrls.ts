/**
 * Direcciones de los servicios públicos del Catastro (sin dependencias, lo usa también el servidor).
 * Solo datos no protegidos: geometría, referencia, localización, uso y superficie. Los titulares
 * no son públicos y no se consultan.
 */
export type CatastroQuery =
  | { kind: 'parcela'; refcat: string; epsg: number }
  | { kind: 'colindantes'; refcat: string; epsg: number }
  | { kind: 'datos'; refcat: string }
  | { kind: 'punto'; x: number; y: number; epsg: number };

const OVC = 'https://ovc.catastro.meh.es';
export const CATASTRO_HOST = 'ovc.catastro.meh.es';

export function cleanRefcat(rc: string): string {
  return String(rc).replace(/\s+/g, '').toUpperCase();
}

export function isRefcat14or20(rc: string): boolean {
  return /^[0-9A-Z]{14}([0-9A-Z]{6})?$/.test(rc);
}

/** Construye la dirección del servicio. Lanza un error si los datos no son válidos. */
export function catastroUrl(q: CatastroQuery): string {
  const epsgOk = (e: number) => Number.isInteger(e) && e >= 2000 && e <= 99999;
  if (q.kind === 'punto') {
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || !epsgOk(q.epsg)) throw new Error('Coordenadas no válidas');
    return `${OVC}/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:${q.epsg}&Coordenada_X=${q.x}&Coordenada_Y=${q.y}`;
  }
  const rc = cleanRefcat(q.refcat);
  if (!isRefcat14or20(rc)) throw new Error('Referencia catastral no válida (14 o 20 caracteres)');
  const rc14 = rc.slice(0, 14);
  if (q.kind === 'datos') {
    return `${OVC}/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${rc}`;
  }
  if (!epsgOk(q.epsg)) throw new Error('Sistema de referencia no válido');
  // El servicio WFS INSPIRE del Catastro usa el nombre de parámetro STOREDQUERIE_ID (así, con esa
  // grafía); se envía también la forma estándar STOREDQUERY_ID por si lo corrigen.
  const sq = q.kind === 'parcela' ? 'GetParcel' : 'GetNeighbourParcel';
  return `${OVC}/INSPIRE/wfsCP.aspx?service=wfs&version=2.0.0&request=GetFeature&STOREDQUERIE_ID=${sq}&STOREDQUERY_ID=${sq}&refcat=${rc14}&srsname=EPSG::${q.epsg}`;
}
