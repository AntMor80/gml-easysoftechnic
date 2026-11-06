import { CREDIT_COST, type CreditAction } from '@gml/core';
import { api } from './api';

export { CREDIT_COST };
export type Action = CreditAction;

/**
 * Modo desarrollo: si la web se abre sin servidor (por ejemplo con iniciar-web.bat)
 * no se cobra nada. En producción el servidor sirve la web y responde en /api.
 */
export let DEV_MODE = true;
export function setDevMode(v: boolean) {
  DEV_MODE = v;
}

export type SpendResult = { ok: true; balance?: number } | { ok: false; reason: 'login' | 'credits' | 'error'; message: string };

export async function spend(action: Action): Promise<SpendResult> {
  if (DEV_MODE || CREDIT_COST[action] === 0) return { ok: true };
  try {
    const r = await api<{ balance: number }>('/api/credits/spend', { action });
    window.dispatchEvent(new CustomEvent('gml-balance', { detail: r.balance }));
    return { ok: true, balance: r.balance };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    if (err.status === 401) return { ok: false, reason: 'login', message: 'Inicia sesión para usar esta función.' };
    if (err.status === 402) return { ok: false, reason: 'credits', message: `No te quedan créditos suficientes (hacen falta ${CREDIT_COST[action]}). Compra un bono en Mi cuenta.` };
    return { ok: false, reason: 'error', message: err.message ?? 'No se ha podido conectar con el servidor.' };
  }
}

/**
 * Cobra una actuación y, si no se puede, avisa al usuario. Devuelve true si se puede seguir.
 * El aviso llega a la aplicación como evento para no tener que pasar el estado a cada panel.
 */
export async function charge(action: Action): Promise<boolean> {
  const r = await spend(action);
  if (!r.ok) {
    window.dispatchEvent(new CustomEvent('gml-notice', { detail: { kind: 'error', text: r.message, reason: r.reason } }));
  }
  return r.ok;
}
