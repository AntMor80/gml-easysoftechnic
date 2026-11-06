import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MapView, BASE_LABELS, type BaseLayer } from './map/MapView';
import { HISTORIC_FALLBACK, OVERLAY_LABELS, loadHistoricFlights, type OverlayId } from './map/overlays';
import { initialState, reducer } from './lib/state';
import { loadFile } from './lib/loadFile';
import { FilesPanel } from './panels/FilesPanel';
import { VerticesPanel } from './panels/VerticesPanel';
import { ValidationPanel } from './panels/ValidationPanel';
import { GmlPanel } from './panels/GmlPanel';
import { ExportPanel } from './panels/ExportPanel';
import { ReportsPanel } from './panels/ReportsPanel';
import { DEV_MODE } from './lib/credits';

const TABS = [
  { id: 'files', label: 'Archivos' },
  { id: 'vertices', label: 'Vértices' },
  { id: 'validate', label: 'Validar' },
  { id: 'gml', label: 'Crear GML' },
  { id: 'export', label: 'Exportar' },
  { id: 'reports', label: 'Informes' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [tab, setTab] = useState<Tab>('files');
  const [base, setBase] = useState<BaseLayer>('pnoa');
  const [catastro, setCatastro] = useState(true);
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>({ historica: false, relieve: false, curvas: false, limites: false });
  const [flights, setFlights] = useState(HISTORIC_FALLBACK);
  const [historic, setHistoric] = useState(HISTORIC_FALLBACK[0]!.name);
  const [historicOpacity, setHistoricOpacity] = useState(1);
  useEffect(() => {
    if (!overlays.historica || flights !== HISTORIC_FALLBACK) return;
    void loadHistoricFlights().then((list) => {
      setFlights(list);
      if (!list.some((f) => f.name === historic)) setHistoric(list[0]!.name);
    });
  }, [overlays.historica, flights, historic]);
  const activeOverlays = Object.values(overlays).filter(Boolean).length + (catastro ? 1 : 0);
  const [fitKey, setFitKey] = useState(0);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const open = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        try {
          const r = await loadFile(file, state.epsg);
          if (r.epsg && r.epsg !== state.epsg) {
            dispatch({ type: 'epsg', epsg: r.epsg });
            dispatch({ type: 'message', kind: 'info', text: `Sistema de referencia cambiado a EPSG:${r.epsg} según ${file.name}.` });
          }
          r.warnings.forEach((w) => dispatch({ type: 'message', kind: 'info', text: `${file.name}: ${w}` }));
          if (r.items.length) dispatch({ type: 'add', items: r.items });
        } catch (e) {
          dispatch({ type: 'message', kind: 'error', text: `No se ha podido leer ${file.name}: ${(e as Error).message}` });
        }
      }
      setFitKey((k) => k + 1);
    },
    [state.epsg],
  );

  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'expireMessages', before: Date.now() - 9000 }), 1000);
    return () => clearInterval(t);
  }, []);

  const selected = state.items.find((i) => i.uid === state.selected);
  const markers = useMemo(() => state.issues.flatMap((x) => x.issues.flatMap((i) => (i.point ? [i.point] : []))), [state.issues]);

  return (
    <div
      className={`app ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void open(e.dataTransfer.files); }}
    >
      <header>
        <div className="brand">GML <span>EasySoftechnic</span></div>
        <div className="layers">
          <select value={base} onChange={(e) => setBase(e.target.value as BaseLayer)} aria-label="Mapa base">
            {(Object.keys(BASE_LABELS) as BaseLayer[]).map((k) => (
              <option key={k} value={k}>{BASE_LABELS[k]}</option>
            ))}
          </select>
          <details className="overlay-menu">
            <summary>Capas{activeOverlays ? ` (${activeOverlays})` : ''}</summary>
            <div className="overlay-list">
              <label title="Las parcelas del Catastro aparecen al acercarse a escala de calle"><input type="checkbox" checked={catastro} onChange={(e) => setCatastro(e.target.checked)} /> Catastro (al acercar)</label>
              {(Object.keys(OVERLAY_LABELS) as OverlayId[]).map((id) => (
                <label key={id}><input type="checkbox" checked={overlays[id]} onChange={(e) => setOverlays((o) => ({ ...o, [id]: e.target.checked }))} /> {OVERLAY_LABELS[id]}</label>
              ))}
              {overlays.historica && (
                <div className="historic">
                  <select value={historic} onChange={(e) => setHistoric(e.target.value)} aria-label="Vuelo histórico">
                    {flights.map((f) => <option key={f.name} value={f.name}>{f.title}</option>)}
                  </select>
                  <label>Transparencia <input type="range" min={0} max={1} step={0.05} value={1 - historicOpacity} onChange={(e) => setHistoricOpacity(1 - Number(e.target.value))} /></label>
                </div>
              )}
            </div>
          </details>
          <button onClick={() => setFitKey((k) => k + 1)} disabled={!state.items.length}>Ver todo</button>
        </div>
        <div className="credits">{DEV_MODE ? 'Modo desarrollo · sin cobro' : 'Créditos'}</div>
      </header>
      <main>
        <MapView items={state.items} epsg={state.epsg} selected={state.selected} markers={markers} base={base} catastro={catastro} overlays={overlays} historic={historic} historicOpacity={historicOpacity} fitKey={fitKey} onSelect={(uid) => dispatch({ type: 'select', uid })} />
        <aside>
          <nav>
            {TABS.map((t) => <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </nav>
          {tab === 'files' && <FilesPanel state={state} dispatch={dispatch} onOpen={() => input.current?.click()} />}
          {tab === 'vertices' && <VerticesPanel item={selected} />}
          {tab === 'validate' && <ValidationPanel state={state} dispatch={dispatch} />}
          {tab === 'gml' && <GmlPanel state={state} dispatch={dispatch} />}
          {tab === 'export' && <ExportPanel state={state} />}
          {tab === 'reports' && <ReportsPanel state={state} />}
        </aside>
      </main>
      {state.messages.length > 0 && (
        <div className="toasts" onClick={() => dispatch({ type: 'clearMessages' })} title="Pulsa para cerrar">
          {state.messages.map((m, i) => <div key={i} className={m.kind}>{m.text}</div>)}
        </div>
      )}
      <input ref={input} type="file" multiple hidden accept=".gml,.xml,.dxf,.txt,.csv,.geojson,.json" onChange={(e) => { if (e.target.files) void open(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
