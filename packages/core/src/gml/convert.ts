import { parseGml } from './parse.js';
import { writeParcelGml } from './writeParcel.js';
import type { Parcel, ParcelNamespace } from '../types.js';

/**
 * Convierte un GML de parcela v3 (o un v4 mal formado por un CAD) en un v4 limpio.
 * Reescribe el archivo desde la geometría leída, lo que corrige errores de sintaxis,
 * orientación de anillos y anillos sin cerrar.
 */
export function convertParcelGmlToV4(xml: string, opts: { coordDecimals?: number; areaDecimals?: number } = {}) {
  const parsed = parseGml(xml);
  const parcels: Parcel[] = parsed.features
    .filter((f) => f.kind === 'CadastralParcel')
    .map((f, i) => {
      const ns: ParcelNamespace = f.namespace === 'ES.LOCAL.CP' ? 'ES.LOCAL.CP' : 'ES.SDGC.CP';
      return {
        id: f.localId ?? f.gmlId?.split('.').pop() ?? `PARCELA_${i + 1}`,
        namespace: ns,
        polygons: f.polygons,
        area: f.declaredArea,
      };
    });
  if (parcels.length === 0) throw new Error('No se han encontrado parcelas en el archivo.');
  if (!parsed.epsg) throw new Error('El archivo no indica sistema de referencia; elige el huso UTM.');
  return {
    xml: writeParcelGml(parcels, { epsg: parsed.epsg, ...opts }),
    fromVersion: parsed.version,
    parcels,
    warnings: parsed.warnings,
  };
}
