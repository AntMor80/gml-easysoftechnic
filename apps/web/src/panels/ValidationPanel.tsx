import { useState } from 'react';
import { crossOverlaps, snapToReference, validateBuildingInParcel, validatePolygons, totalArea, type Issue } from '@gml/core';
import type { Action, State } from '../lib/state';

export function runValidation(state: State, tolerance: number): State['issues'] {
  const out: State['issues'] = [];
  const parcels = state.items.filter((i) => i.role === 'parcela');
  for (const it of state.items) {
    if (it.role === 'referencia') continue;
    const issues: Issue[] = validatePolygons(it.polygons);
    if ((it.role === 'edificio' || it.role === 'piscina') && parcels.length) {
      issues.push(...validateBuildingInParcel(it.polygons, parcels.flatMap((p) => p.polygons), tolerance));
    }
    out.push({ uid: it.uid, issues });
  }
  // identificadores repetidos entre parcelas (el Catastro los rechaza en un mismo GML)
  const seen = new Map<string, string>();
  for (const it of parcels) {
    if (seen.has(it.id)) out.find((x) => x.uid === it.uid)?.issues.push({ code: 'DUPLICATE_ID', severity: 'error', message: `El identificador ${it.id} está repetido. Cámbialo en la pestaña Archivos.` });
    else seen.set(it.id, it.uid);
  }
  // solapes entre recintos del mismo tipo (p. ej. viviendas colindantes)
  const same = state.items.filter((i) => i.role === 'parcela');
  for (const o of crossOverlaps(same.map((i) => ({ id: i.uid, polygons: i.polygons })))) {
    const a = state.items.find((i) => i.uid === o.a)!;
    const b = state.items.find((i) => i.uid === o.b)!;
    out.find((x) => x.uid === o.a)?.issues.push({ code: 'OVERLAP_NEIGHBOUR', severity: 'error', message: `${a.id} y ${b.id} se solapan ${o.area.toFixed(4)} m².` });
  }
  return out;
}

export function ValidationPanel({ state, dispatch }: { state: State; dispatch: (a: Action) => void }) {
  const [tol, setTol] = useState(0.005);
  const [snapTol, setSnapTol] = useState(0.05);
  const [snapTarget, setSnapTarget] = useState('');
  const [snapRef, setSnapRef] = useState('');
  const name = (uid: string) => state.items.find((i) => i.uid === uid)?.id ?? uid;
  const total = state.issues.reduce((s, x) => s + x.issues.filter((i) => i.severity === 'error').length, 0);

  const doSnap = () => {
    const t = state.items.find((i) => i.uid === snapTarget);
    const r = state.items.find((i) => i.uid === snapRef);
    if (!t || !r) return;
    const res = snapToReference(t.polygons, r.polygons, snapTol);
    dispatch({ type: 'update', uid: t.uid, patch: { polygons: res.polygons } });
    const moved = res.moved.filter((m) => m.distance > 0.0005);
    dispatch({
      type: 'message',
      kind: 'info',
      text: `${t.id} ajustado a ${r.id}: ${moved.length} vértice(s) movido(s) (máx. ${Math.max(0, ...moved.map((m) => m.distance)).toFixed(3)} m), ${res.inserted.length} insertado(s). Nueva superficie ${totalArea(res.polygons).toFixed(2)} m².`,
    });
  };

  return (
    <div className="panel">
      <label>Tolerancia del informe de ubicación (m)
        <select value={tol} onChange={(e) => setTol(Number(e.target.value))}>
          {[0.002, 0.005, 0.01, 0.015, 0.02].map((v) => <option key={v} value={v}>{v.toFixed(3)}</option>)}
        </select>
      </label>
      <button className="primary" onClick={() => dispatch({ type: 'issues', issues: runValidation(state, tol) })} disabled={!state.items.length}>Validar todo</button>
      {state.issues.length > 0 && (
        <p className={total ? 'bad' : 'good'}>{total ? `${total} error(es). Corrígelos antes de generar el GML.` : 'Sin errores en las comprobaciones previas.'}</p>
      )}
      {state.issues.map((x) =>
        x.issues.length ? (
          <div key={x.uid} className="issues">
            <h4>{name(x.uid)}</h4>
            <ul>{x.issues.map((i, k) => <li key={k} className={i.severity}>{i.message}</li>)}</ul>
          </div>
        ) : null,
      )}
      <h3>Ajustar medianera</h3>
      <p className="hint">Encaja un recinto con su colindante: mueve los vértices cercanos y añade los del vecino en el lado común.</p>
      <label>Recinto a ajustar<select value={snapTarget} onChange={(e) => setSnapTarget(e.target.value)}><option value="">—</option>{state.items.map((i) => <option key={i.uid} value={i.uid}>{i.id}</option>)}</select></label>
      <label>Colindante de referencia<select value={snapRef} onChange={(e) => setSnapRef(e.target.value)}><option value="">—</option>{state.items.filter((i) => i.uid !== snapTarget).map((i) => <option key={i.uid} value={i.uid}>{i.id}</option>)}</select></label>
      <label>Distancia máxima (m)<input type="number" step="0.01" min="0.001" value={snapTol} onChange={(e) => setSnapTol(Number(e.target.value))} /></label>
      <button onClick={doSnap} disabled={!snapTarget || !snapRef}>Ajustar</button>
    </div>
  );
}
