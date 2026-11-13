import { CATASTRO_HOST, catastroUrl, type CatastroQuery } from '@gml/core';
import { desktop } from './desktop';
import { DEV_MODE } from './credits';

/**
 * Consulta a los servicios del Catastro por el camino que haya:
 * - escritorio: lo hace la aplicación (sin restricciones del navegador);
 * - web publicada: a través del servidor (/api/catastro);
 * - modo desarrollo: a través del intermediario de Vite (/ovc).
 */
export async function fetchCatastro(q: CatastroQuery): Promise<string> {
  const url = catastroUrl(q);
  if (desktop?.fetchCatastro) return desktop.fetchCatastro(url);
  let res: Response;
  try {
    if (location.protocol === 'file:') {
      // Archivo HTML abierto desde el disco: se intenta la llamada directa.
      res = await fetch(url);
    } else if (DEV_MODE) {
      res = await fetch(url.replace(`https://${CATASTRO_HOST}`, '/ovc'));
    } else {
      const params = new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]));
      res = await fetch(`/api/catastro?${params}`, { credentials: 'same-origin' });
    }
  } catch {
    throw new Error(
      location.protocol === 'file:'
        ? 'El Catastro no permite consultas desde un archivo abierto en el ordenador. Esta pestaña funciona con iniciar-web.bat, con la web publicada o con la aplicación de escritorio.'
        : 'No se ha podido conectar con el Catastro.',
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = `El Catastro no responde (error ${res.status}).`;
    try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /* no JSON */ }
    if (res.status === 401) msg = 'Inicia sesión para consultar el Catastro.';
    throw new Error(msg);
  }
  if (/^\s*<!doctype html/i.test(text)) throw new Error('La consulta al Catastro no está disponible en este modo.');
  return text;
}
