import { totalArea } from '@gml/core';
import type { Action, Item, Role, State } from '../lib/state';

const ROLES: { v: Role; label: string }[] = [
  { v: 'parcela', label: 'Parcela' },
  { v: 'edificio', label: 'Edificio' },
  { v: 'piscina', label: 'Piscina / otra' },
  { v: 'referencia', label: 'Referencia (colindante o Catastro)' },
];

export function FilesPanel({ state, dispatch, onOpen }: { state: State; dispatch: (a: Action) => void; onOpen: () => void }) {
  return (
    <div className="panel">
      <p className="hint">Arrastra archivos al mapa o pulsa Abrir. Admite GML (v3 y v4), DXF, TXT o CSV de coordenadas, salida del comando LIST de AutoCAD y GeoJSON.</p>
      <button className="primary" onClick={onOpen}>Abrir archivos…</button>
      {state.items.length === 0 && <p className="empty">Todavía no hay recintos cargados.</p>}
      <ul className="items">
        {state.items.map((it: Item) => (
          <li key={it.uid} className={it.uid === state.selected ? 'sel' : ''} onClick={() => dispatch({ type: 'select', uid: it.uid })}>
            <div className="row">
              <input type="checkbox" checked={it.visible} onChange={(e) => dispatch({ type: 'update', uid: it.uid, patch: { visible: e.target.checked } })} onClick={(e) => e.stopPropagation()} title="Mostrar" />
              <input className="id" value={it.id} onChange={(e) => dispatch({ type: 'update', uid: it.uid, patch: { id: e.target.value } })} title="Referencia catastral o identificador" />
              <button className="icon" title="Quitar" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'remove', uid: it.uid }); }}>✕</button>
            </div>
            <div className="row small">
              <select value={it.role} onChange={(e) => dispatch({ type: 'update', uid: it.uid, patch: { role: e.target.value as Role } })} onClick={(e) => e.stopPropagation()}>
                {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
              <span>{totalArea(it.polygons).toLocaleString('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} m²</span>
            </div>
            <div className="src">{it.source}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
