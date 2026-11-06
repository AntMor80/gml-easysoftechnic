import type { Issue, Polygon } from '../types.js';

export interface Person {
  nombre: string;
  nif?: string;
  titulacion?: string;
  colegio?: string;
  numeroColegiado?: string;
  direccion?: string;
  email?: string;
  telefono?: string;
}

export interface ReportData {
  titulo?: string;
  autor: Person;
  cliente?: Person;
  /** Referencia catastral o identificador del recinto. */
  referencia: string;
  municipio?: string;
  provincia?: string;
  direccion?: string;
  /** Tipo de actuación: segregación, agregación, subsanación, edificio… */
  actuacion?: string;
  epsg: number;
  recintos: { id: string; polygons: Polygon[] }[];
  /** Recintos de referencia (p. ej. parcela catastral actual) dibujados en otro color. */
  referenciaCatastral?: { id: string; polygons: Polygon[] }[];
  issues?: Issue[];
  fecha?: string;
  lugar?: string;
  observaciones?: string;
  /** Logo del despacho en data URL (PNG o JPEG). */
  logo?: string;
  coordDecimals?: number;
}
