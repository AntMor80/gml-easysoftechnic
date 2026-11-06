/**
 * Coste en créditos de cada actuación (web). El servidor de cuentas y la
 * compra de bonos se conectan en la fase 3; mientras tanto la web funciona
 * en modo desarrollo sin cobrar.
 */
export const CREDIT_COST = {
  gmlParcela: 1,
  gmlEdificio: 1,
  conversionV4: 1,
  paqueteDxf: 2,
  informe: 1,
  exportacion: 0,
} as const;

export type Action = keyof typeof CREDIT_COST;

export const DEV_MODE = true;

export async function spend(action: Action): Promise<boolean> {
  if (DEV_MODE || CREDIT_COST[action] === 0) return true;
  // TODO fase 3 (servidor): POST /api/credits/spend
  return false;
}
