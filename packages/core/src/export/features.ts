import type { Polygon } from '../types.js';

/** Elemento genérico para exportar: geometría + atributos planos. */
export interface ExportFeature {
  id: string;
  polygons: Polygon[];
  properties?: Record<string, string | number | boolean | null | undefined>;
}
