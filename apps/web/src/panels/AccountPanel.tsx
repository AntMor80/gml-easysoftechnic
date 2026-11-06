import { useEffect, useState } from 'react';
import {
  CREDIT_ACTION_LABELS,
  CREDIT_COST,
  DESKTOP_MODULES,
  LICENSE_PLANS,
  euros,
  MODULE_PRICE,
  licensePrice,
  type DesktopModule,
  type LicensePlan,
} from '@gml/core';
import { api } from '../lib/api';
import type { Account, Me } from '../lib/account';

const ACTION_LABELS = { ...CREDIT_ACTION_LABELS, informe: 'Cada informe', exportacion: 'Exportaciones' };

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export function AccountPanel({ account, notify }: { account: Account; notify: (kind: 'info' | 'error', text: string) => void }) {
  const { online, me } = account;
  if (online === undefined) return <div className="panel"><p className="empty">Conectando…</p></div>;
  if (!online)
    return (
      <div className="panel">
        <h3>Modo desarrollo</h3>
        <p className="hint">La web se está ejecutando sin servidor (por ejemplo con iniciar-web.bat), así que todas las funciones son gratuitas y no hay cuentas. Cuando se publique en Hostinger, aquí aparecerán el acceso, el saldo de créditos y la compra de bonos y licencias.</p>
        <Prices />
      </div>
    );
  return me ? <Dashboard account={account} me={me} notify={notify} /> : <Auth account={account} notify={notify} />;
}

function Prices() {
  return (
    <>
      <h3>Coste en créditos</h3>
      <table className="grid">
        <tbody>
          {(Object.keys(CREDIT_COST) as (keyof typeof CREDIT_COST)[]).map((k) => (
            <tr key={k}><td>{ACTION_LABELS[k]}</td><td className="n">{CREDIT_COST[k] ? `${CREDIT_COST[k]} crédito${CREDIT_COST[k] > 1 ? 's' : ''}` : 'gratis'}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Auth({ account, notify }: { account: Account; notify: (kind: 'info' | 'error', text: string) => void }) {
  const resetToken = /restablecer=([\w-]+)/.exec(location.hash)?.[1];
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api('/api/auth/forgot', { email });
        notify('info', 'Si hay una cuenta con ese correo, te hemos enviado un enlace para elegir contraseña nueva.');
        setMode('login');
      } else {
        const path = mode === 'login' ? '/api/auth/login' : mode === 'register' ? '/api/auth/register' : '/api/auth/reset';
        await api(path, mode === 'reset' ? { token: resetToken, password } : { email, password, name });
        if (mode === 'reset') history.replaceState(null, '', location.pathname);
        await account.refresh();
      }
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h3>{{ login: 'Entrar', register: 'Crear cuenta', forgot: 'Recuperar contraseña', reset: 'Nueva contraseña' }[mode]}</h3>
      {mode === 'register' && <p className="hint">Al crear la cuenta recibes créditos de regalo para probar.</p>}
      {mode !== 'reset' && <label>Correo electrónico<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
      {mode === 'register' && <label>Nombre o estudio<input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} /></label>}
      {mode !== 'forgot' && (
        <label>Contraseña{mode !== 'login' && ' (mínimo 8 caracteres)'}
          <input type="password" required minLength={mode === 'login' ? 1 : 8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      <button className="primary" disabled={busy}>{busy ? 'Un momento…' : { login: 'Entrar', register: 'Crear cuenta', forgot: 'Enviar enlace', reset: 'Guardar contraseña' }[mode]}</button>
      {mode === 'login' && (
        <>
          <button type="button" onClick={() => setMode('register')}>¿No tienes cuenta? Crear una</button>
          <button type="button" onClick={() => setMode('forgot')}>He olvidado la contraseña</button>
        </>
      )}
      {mode !== 'login' && <button type="button" onClick={() => setMode('login')}>Volver a entrar</button>}
      <Prices />
    </form>
  );
}

function Dashboard({ account, me, notify }: { account: Account; me: Me; notify: (kind: 'info' | 'error', text: string) => void }) {
  const { catalog } = account;
  const [history, setHistory] = useState<{ amount: number; reason: string; at: string }[]>();
  const [mods, setMods] = useState<DesktopModule[]>([]);
  const [plan, setPlan] = useState<LicensePlan>('anual');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (/cuenta-pagado/.test(location.hash)) {
      notify('info', 'Pago recibido. Si el saldo o la licencia no aparecen aún, espera unos segundos y pulsa Actualizar.');
      history_clear();
      const t = setTimeout(() => void account.refresh(), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async (body: unknown, label: string) => {
    setBusy(label);
    try {
      const { url } = await api<{ url: string }>('/api/checkout', body);
      location.href = url;
    } catch (e) {
      notify('error', (e as Error).message);
      setBusy('');
    }
  };

  const release = async (key: string, machineId: string) => {
    try {
      await api('/api/licenses/release', { key, machineId });
      await account.refresh();
    } catch (e) {
      notify('error', (e as Error).message);
    }
  };

  const allMods = Object.keys(DESKTOP_MODULES) as DesktopModule[];
  const price = licensePrice(mods, plan);
  const full = mods.length * MODULE_PRICE[plan];

  return (
    <div className="panel">
      <div className="account-head">
        <div>
          <strong>{me.user.name || me.user.email}</strong>
          <div className="hint">{me.user.email}</div>
        </div>
        <button onClick={async () => { await api('/api/auth/logout', {}); account.setMe(null); }}>Salir</button>
      </div>

      <div className="balance"><span>{me.user.credits}</span> créditos</div>

      <h3>Comprar créditos</h3>
      {!catalog?.paymentsEnabled && <p className="hint">Los pagos todavía no están activados en el servidor.</p>}
      <div className="formats">
        {catalog?.bundles.map((b) => (
          <button key={b.id} disabled={!catalog.paymentsEnabled || !!busy} onClick={() => buy({ kind: 'bundle', id: b.id }, b.id)}>
            <strong>{b.name}</strong>
            <span>{euros(b.price)} · {euros(b.price / b.credits)} por crédito</span>
          </button>
        ))}
      </div>
      <Prices />

      <h3>Movimientos</h3>
      {history ? (
        <table className="grid">
          <tbody>
            {history.map((h, i) => (
              <tr key={i}><td>{new Date(h.at).toLocaleDateString('es-ES')}</td><td>{h.reason}</td><td className="n">{h.amount > 0 ? `+${h.amount}` : h.amount}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <button onClick={async () => setHistory((await api<{ entries: typeof history & object }>('/api/credits/history')).entries)}>Ver movimientos</button>
      )}

      <h3>Aplicación de escritorio</h3>
      {me.licenses.length === 0 && <p className="hint">Todavía no tienes licencias.</p>}
      <ul className="items">
        {me.licenses.map((l) => {
          const expired = l.expiresAt && new Date(l.expiresAt) < new Date();
          return (
            <li key={l.key}>
              <div className="row"><code className="id">{l.key}</code><button className="icon" title="Copiar clave" onClick={() => void navigator.clipboard.writeText(l.key)}>Copiar</button></div>
              <div className="src">{l.modules.length === allMods.length ? 'Todos los módulos' : l.modules.map((m) => DESKTOP_MODULES[m]).join(', ')}</div>
              <div className={expired || l.revoked ? 'bad' : 'src'}>
                {l.revoked ? 'Anulada' : `${LICENSE_PLANS[l.plan].name} · ${l.expiresAt ? `${expired ? 'caducó' : 'válida hasta'} el ${new Date(l.expiresAt).toLocaleDateString('es-ES')}` : 'sin caducidad'}`}
              </div>
              <div className="src">Equipos activados: {l.activations.length} de {catalog?.maxActivations ?? 2}</div>
              {l.activations.map((a) => (
                <div key={a.machineId} className="row small">
                  <span>{a.machineName || a.machineId} · visto el {new Date(a.lastSeen).toLocaleDateString('es-ES')}</span>
                  <button className="icon" onClick={() => void release(l.key, a.machineId)}>Liberar</button>
                </div>
              ))}
            </li>
          );
        })}
      </ul>

      <h4>Comprar licencia</h4>
      <p className="hint">Elige los módulos. Cuantos más, mayor descuento (2: 10 %, 3-4: 20 %, 5-6: 30 %, todos: 40 %). Cada licencia se puede usar en {catalog?.maxActivations ?? 2} equipos y funciona {catalog?.offlineDays ?? 30} días sin conexión.</p>
      <div className="checks">
        {allMods.map((m) => (
          <label key={m} className="check"><input type="checkbox" checked={mods.includes(m)} onChange={(e) => setMods((s) => (e.target.checked ? [...s, m] : s.filter((x) => x !== m)))} /> {DESKTOP_MODULES[m]}</label>
        ))}
        <button className="icon" onClick={() => setMods(mods.length === allMods.length ? [] : allMods)}>{mods.length === allMods.length ? 'Quitar todos' : 'Todos los módulos'}</button>
      </div>
      <label>Duración
        <select value={plan} onChange={(e) => setPlan(e.target.value as LicensePlan)}>
          {(Object.keys(LICENSE_PLANS) as LicensePlan[]).map((p) => <option key={p} value={p}>{LICENSE_PLANS[p].name}</option>)}
        </select>
      </label>
      {mods.length > 0 && <p className="good">{euros(price)}{price < full && <span className="hint"> (antes {euros(full)})</span>}</p>}
      <button className="primary" disabled={!mods.length || !catalog?.paymentsEnabled || !!busy} onClick={() => buy({ kind: 'license', modules: mods, plan }, 'lic')}>
        {busy === 'lic' ? 'Abriendo pago…' : 'Comprar licencia'}
      </button>

      {me.admin && <Admin notify={notify} onDone={account.refresh} />}
      <button onClick={() => void account.refresh()}>Actualizar</button>
    </div>
  );
}

function history_clear() {
  history.replaceState(null, '', location.pathname);
}

function Admin({ notify, onDone }: { notify: (kind: 'info' | 'error', text: string) => void; onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('10');
  const [mods, setMods] = useState<DesktopModule[]>([]);
  const [plan, setPlan] = useState<LicensePlan>('anual');
  const run = async (path: string, body: unknown, ok: (r: Record<string, unknown>) => string) => {
    try {
      notify('info', ok(await api<Record<string, unknown>>(path, body)));
      await onDone();
    } catch (e) {
      notify('error', (e as Error).message);
    }
  };
  return (
    <>
      <h3>Administración</h3>
      <label>Correo del cliente<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <div className="two">
        <label>Créditos<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></label>
        <button onClick={() => run('/api/admin/credits', { email, amount: Number(amount) }, (r) => `Créditos añadidos. Saldo del cliente: ${String(r.balance)}`)}>Regalar créditos</button>
      </div>
      <div className="checks">
        {(Object.keys(DESKTOP_MODULES) as DesktopModule[]).map((m) => (
          <label key={m} className="check"><input type="checkbox" checked={mods.includes(m)} onChange={(e) => setMods((s) => (e.target.checked ? [...s, m] : s.filter((x) => x !== m)))} /> {DESKTOP_MODULES[m]}</label>
        ))}
      </div>
      <div className="two">
        <select value={plan} onChange={(e) => setPlan(e.target.value as LicensePlan)}>
          {(Object.keys(LICENSE_PLANS) as LicensePlan[]).map((p) => <option key={p} value={p}>{LICENSE_PLANS[p].name}</option>)}
        </select>
        <button onClick={() => run('/api/admin/license', { email, modules: mods, plan, notify: true }, (r) => `Licencia creada y enviada por correo: ${(r.license as { key: string }).key}`)}>Crear licencia</button>
      </div>
    </>
  );
}
