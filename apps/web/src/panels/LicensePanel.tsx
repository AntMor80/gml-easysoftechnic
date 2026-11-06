import { useState } from 'react';
import { DESKTOP_MODULES, LICENSE_PLANS, type DesktopModule } from '@gml/core';
import { desktop, type DesktopLicense } from '../lib/desktop';

const STATUS: Record<DesktopLicense['status'], string> = {
  none: 'Sin licencia activada. Puedes abrir, ver y validar archivos; para crear GML, informes y exportaciones activa una licencia.',
  ok: 'Licencia activa.',
  invalid: 'El certificado de licencia guardado no es válido. Vuelve a activar la clave.',
  'other-machine': 'La licencia guardada pertenece a otro equipo. Vuelve a activar la clave en este.',
  expired: 'La licencia ha caducado. Renuévala en la web.',
  'offline-expired': 'Han pasado más de 30 días sin conectar. Conéctate a internet y pulsa Comprobar ahora.',
};

export function LicensePanel({ lic, notify }: { lic?: DesktopLicense; notify: (kind: 'info' | 'error', text: string) => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  if (!desktop || !lic) return <div className="panel"><p className="empty">Cargando…</p></div>;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) notify('info', ok);
    } catch (e) {
      notify('error', (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setBusy(false);
    }
  };

  const active = new Set(lic.status === 'ok' ? lic.modules : []);
  return (
    <div className="panel">
      <h3>Licencia de escritorio</h3>
      <p className={lic.status === 'ok' ? 'good' : lic.status === 'none' ? 'hint' : 'bad'}>{STATUS[lic.status]}</p>
      {lic.key && <p className="hint">Clave: <code>{lic.key}</code> · Equipo: {lic.machineName}</p>}
      {lic.status === 'ok' && lic.payload && (
        <p className="hint">
          {LICENSE_PLANS[lic.payload.plan].name}
          {lic.payload.expiresAt ? `, válida hasta el ${new Date(lic.payload.expiresAt).toLocaleDateString('es-ES')}` : ', sin caducidad'}.
          {' '}Funciona sin conexión hasta el {new Date(lic.payload.offlineUntil).toLocaleDateString('es-ES')}.
        </p>
      )}

      <h4>Módulos</h4>
      <ul className="checks">
        {(Object.keys(DESKTOP_MODULES) as DesktopModule[]).map((m) => (
          <li key={m} className={active.has(m) ? 'good' : 'hint'} style={{ listStyle: 'none' }}>{active.has(m) ? '✓' : '🔒'} {DESKTOP_MODULES[m]}</li>
        ))}
      </ul>

      {lic.status !== 'ok' && (
        <form onSubmit={(e) => { e.preventDefault(); void run(() => desktop!.activate(key), 'Licencia activada en este equipo.'); }} className="checks">
          <label>Clave de licencia<input value={key} placeholder="GML-XXXX-XXXX-XXXX-XXXX" onChange={(e) => setKey(e.target.value.toUpperCase())} /></label>
          <button className="primary" disabled={busy || key.trim().length < 10}>{busy ? 'Activando…' : 'Activar en este equipo'}</button>
        </form>
      )}
      <button onClick={() => void desktop!.openShop()}>Comprar o renovar licencia en la web</button>
      {lic.key && <button disabled={busy} onClick={() => void run(() => desktop!.refresh(), 'Licencia comprobada.')}>Comprobar ahora</button>}
      {lic.key && (
        <button disabled={busy} onClick={() => confirm('¿Desactivar la licencia en este equipo? Podrás activarla en otro.') && void run(() => desktop!.deactivate(), 'Licencia desactivada en este equipo.')}>
          Desactivar en este equipo
        </button>
      )}
    </div>
  );
}
