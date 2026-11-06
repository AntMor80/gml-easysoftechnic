/**
 * Catálogo comercial compartido por la web, el servidor y la aplicación de escritorio.
 * PRECIOS PROVISIONALES: Antonio los fijará antes del lanzamiento. Importes en céntimos, IVA incluido.
 */

/** Coste en créditos de cada actuación de la web. 0 = gratuita. */
export const CREDIT_COST = {
  gmlParcela: 1,
  gmlEdificio: 1,
  conversionV4: 1,
  paqueteDxf: 2,
  informe: 1,
  exportacion: 0,
} as const;
export type CreditAction = keyof typeof CREDIT_COST;

export const CREDIT_ACTION_LABELS: Record<CreditAction, string> = {
  gmlParcela: 'GML de parcela',
  gmlEdificio: 'GML de edificio',
  conversionV4: 'Conversión a GML v4',
  paqueteDxf: 'Paquete DXF → Catastro',
  informe: 'Informe',
  exportacion: 'Exportación',
};

export interface CreditBundle {
  id: string;
  name: string;
  credits: number;
  /** Céntimos de euro, IVA incluido. */
  price: number;
}

export const CREDIT_BUNDLES: CreditBundle[] = [
  { id: 'b10', name: 'Bono 10 créditos', credits: 10, price: 1500 },
  { id: 'b30', name: 'Bono 30 créditos', credits: 30, price: 3900 },
  { id: 'b100', name: 'Bono 100 créditos', credits: 100, price: 11000 },
];

/** Módulos de la aplicación de escritorio; cada uno se licencia por separado. */
export const DESKTOP_MODULES = {
  gmlParcela: 'GML de parcela',
  gmlEdificio: 'GML de edificio',
  operaciones: 'Operaciones parcelarias',
  geometria: 'Geometría y coordenadas',
  exportacion: 'Conversión y exportación',
  informes: 'Informes y documentos',
  qgis: 'Conexión con QGIS',
} as const;
export type DesktopModule = keyof typeof DESKTOP_MODULES;

export const LICENSE_PLANS = {
  anual: { name: 'Anual', months: 12 },
  bianual: { name: 'Bianual (2 años)', months: 24 },
  vitalicia: { name: 'De por vida', months: null },
} as const;
export type LicensePlan = keyof typeof LICENSE_PLANS;

/** Precio de un módulo según el plan, en céntimos. */
export const MODULE_PRICE: Record<LicensePlan, number> = {
  anual: 5900,
  bianual: 9900,
  vitalicia: 19900,
};

/** Equipos en los que se puede activar a la vez una misma licencia. */
export const MAX_ACTIVATIONS = 2;
/** Días que la aplicación de escritorio funciona sin conexión antes de volver a comprobar la licencia. */
export const OFFLINE_DAYS = 30;

/**
 * Descuento por volumen: 2 módulos 10 %, 3-4 módulos 20 %, 5 o más 30 %, todos 40 %.
 * Devuelve el total en céntimos.
 */
export function licensePrice(modules: DesktopModule[], plan: LicensePlan): number {
  const n = new Set(modules).size;
  if (!n) return 0;
  const all = Object.keys(DESKTOP_MODULES).length;
  const discount = n >= all ? 0.4 : n >= 5 ? 0.3 : n >= 3 ? 0.2 : n === 2 ? 0.1 : 0;
  return Math.round((n * MODULE_PRICE[plan] * (1 - discount)) / 100) * 100;
}

export function isDesktopModule(m: string): m is DesktopModule {
  return Object.prototype.hasOwnProperty.call(DESKTOP_MODULES, m);
}

export function isLicensePlan(p: string): p is LicensePlan {
  return Object.prototype.hasOwnProperty.call(LICENSE_PLANS, p);
}

export const euros = (cents: number) =>
  (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/** Contenido firmado del certificado de licencia que guarda la aplicación de escritorio. */
export interface LicenseTokenPayload {
  /** Clave de licencia. */
  key: string;
  modules: DesktopModule[];
  plan: LicensePlan;
  /** Fin de la licencia (ISO) o null si es de por vida. */
  expiresAt: string | null;
  machineId: string;
  /** Fecha de emisión (ISO). */
  issuedAt: string;
  /** Hasta cuándo vale el certificado sin volver a conectarse (ISO). */
  offlineUntil: string;
  email: string;
}
