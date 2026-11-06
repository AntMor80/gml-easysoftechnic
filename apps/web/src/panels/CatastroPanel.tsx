import { useEffect, useState } from 'react';
import {
  cleanRefcat,
  colindantesReportDefinition,
  isRefcat14or20,
  parseCatastroData,
  parseCatastroParcels,
  parseCatastroPoint,
  totalArea,
  type CatastroData,
  type Colindante,
} from '@gml/core';
import { uid, type Action, type State } from '../lib/state';
import { fetchCatastro } from '../lib/catastro';
import { charge } from '../lib/credits';
import { download, safeName } from '../lib/download';
import { pdfBlob } from '../lib/pdf';

const UTM = [25828, 25829, 25830, 25831];

interface Props {
  state: State;
  dispatch: React.Dispatch<Action>;
  /** Punto pulsado en el mapa mientras esta pestaña está abierta (en el sistema de trabajo). */
  clicked?: [number, number];
  /** Encuadra el mapa en lo cargado. */
  onFit: () => void;
}

export function CatastroPanel({ state, dispatch, clicked, onFit }: Props) {
  const sel = state.items.find((i) => i.uid === state.selected);
  const [rc, setRc] = useState(sel && isRefcat14or20(cleanRefcat(sel.id)) ? sel.id : '');
  const [busy, setBusy] = useState('');
  const [main, setMain] = useState<CatastroData>();
  const [neigh, setNeigh] = useState<(Colindante & { data?: CatastroData })[]>([]);
  const epsg = UTM.includes(state.epsg) ? state.epsg : 25830;
  const ref = cleanRefcat(rc);
  const valid = isRefcat14or20(ref);
  const err = (e: unknown) => dispatch({ type: 'message', kind: 'error', text: (e as Error).message });

  // Pulsar en el mapa identifica la parcela catastral de ese punto.
  useEffect(() => {
    if (!clicked) return;
    setBusy('punto');
    fetchCatastro({ kind: 'punto', x: Math.round(clicked[0] * 100) / 100, y: Math.round(clicked[1] * 100) / 100, epsg: state.epsg })
      .then((t) => {
        const p = parseCatastroPoint(t);
        setRc(p.refcat);
        setMain({ refcat: p.refcat, direccion: p.direccion });
      })
      .catch(err)
      .finally(() => setBusy(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clicked]);

  const loadParcel = async () => {
    setBusy('parcela');
    try {
      const parcels = parseCatastroParcels(await fetchCatastro({ kind: 'parcela', refcat: ref, epsg }));
      if (!parcels.length) throw new Error('El Catastro no ha devuelto ninguna parcela con esa referencia.');
      if (state.epsg !== epsg) dispatch({ type: 'epsg', epsg });
      dispatch({ type: 'add', items: parcels.map((p) => ({ uid: uid(), id: p.refcat, role: 'referencia' as const, polygons: p.polygons, source: 'Catastro · parcela actual', visible: true })) });
      setTimeout(onFit, 50);
      try {
        setMain(parseCatastroData(await fetchCatastro({ kind: 'datos', refcat: ref }), ref));
      } catch { /* los datos son un complemento */ }
      dispatch({ type: 'message', kind: 'info', text: `Parcela ${parcels[0]!.refcat} cargada del Catastro como referencia (${totalArea(parcels[0]!.polygons).toFixed(2)} m²). Puedes cambiarle el papel en Archivos.` });
    } catch (e) {
      err(e);
    } finally {
      setBusy('');
    }
  };

  const loadNeighbours = async () => {
    if (!(await charge('colindantes'))) return;
    setBusy('colindantes');
    try {
      const all = parseCatastroParcels(await fetchCatastro({ kind: 'colindantes', refcat: ref, epsg }));
      const list = all.filter((p) => p.refcat.slice(0, 14) !== ref.slice(0, 14));
      if (state.epsg !== epsg) dispatch({ type: 'epsg', epsg });
      dispatch({ type: 'add', items: list.map((p) => ({ uid: uid(), id: p.refcat, role: 'referencia' as const, polygons: p.polygons, source: 'Catastro · colindante', visible: true })) });
      const rows: (Colindante & { data?: CatastroData })[] = list.map((p) => ({ refcat: p.refcat, polygons: p.polygons, superficie: p.area }));
      setNeigh(rows);
      setTimeout(onFit, 50);
      // Datos públicos de cada colindante, de uno en uno para no saturar el servicio.
      for (let i = 0; i < rows.length && i < 40; i++) {
        try {
          const d = parseCatastroData(await fetchCatastro({ kind: 'datos', refcat: rows[i]!.refcat }), rows[i]!.refcat);
          rows[i] = { ...rows[i]!, direccion: d.direccion, uso: d.uso, superficie: d.superficie ?? rows[i]!.superficie, data: d };
          setNeigh([...rows]);
        } catch { /* se deja sin datos */ }
      }
      if (!main) {
        try { setMain(parseCatastroData(await fetchCatastro({ kind: 'datos', refcat: ref }), ref)); } catch { /* opcional */ }
      }
    } catch (e) {
      err(e);
    } finally {
      setBusy('');
    }
  };

  const csv = () => {
    const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = ['Nº;Referencia catastral;Localización;Uso;Superficie (m²)', ...neigh.map((n, i) => [i + 1, q(n.refcat), q(n.direccion), q(n.uso), (n.superficie ?? totalArea(n.polygons)).toFixed(0)].join(';'))];
    download(`${safeName(ref)}_colindantes.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  };

  const report = async () => {
    let autor = { nombre: 'Técnico' } as { nombre: string; titulacion?: string; colegio?: string; numeroColegiado?: string };
    try { autor = { ...autor, ...JSON.parse(localStorage.getItem('gml-easysoftechnic:autor') ?? '{}') }; } catch { /* sin datos */ }
    const principal = state.items.filter((i) => cleanRefcat(i.id).slice(0, 14) === ref.slice(0, 14));
    const recintos = (principal.length ? principal : state.items.filter((i) => i.role === 'parcela')).map((i) => ({ id: i.id, polygons: i.polygons }));
    setBusy('pdf');
    try {
      download(`${safeName(ref)}_colindantes.pdf`, await pdfBlob(colindantesReportDefinition({
        autor: { ...autor, nombre: autor.nombre || 'Técnico' }, referencia: ref, epsg, recintos, colindantes: neigh, direccionPrincipal: main?.direccion,
      })));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="panel">
      <p className="hint">Consulta los servicios públicos del Catastro. Escribe la referencia catastral o pulsa una parcela en el mapa mientras esta pestaña está abierta.</p>
      <label>Referencia catastral
        <input value={rc} placeholder="14 o 20 caracteres" onChange={(e) => setRc(e.target.value.toUpperCase())} />
      </label>
      {busy === 'punto' && <p className="hint">Buscando la parcela de ese punto…</p>}
      {main && (
        <table className="grid">
          <tbody>
            {main.direccion && <tr><td>Localización</td><td>{main.direccion}</td></tr>}
            {main.clase && <tr><td>Clase</td><td>{main.clase}</td></tr>}
            {main.uso && <tr><td>Uso principal</td><td>{main.uso}</td></tr>}
            {main.superficie !== undefined && <tr><td>Superficie de suelo</td><td className="n">{main.superficie} m²</td></tr>}
            {main.superficieConstruida !== undefined && <tr><td>Superficie construida</td><td className="n">{main.superficieConstruida} m²</td></tr>}
            {main.anoConstruccion !== undefined && <tr><td>Año de construcción</td><td className="n">{main.anoConstruccion}</td></tr>}
            {main.inmuebles !== undefined && <tr><td>Inmuebles</td><td className="n">{main.inmuebles}</td></tr>}
          </tbody>
        </table>
      )}
      <button className="primary" disabled={!valid || !!busy} onClick={() => void loadParcel()}>{busy === 'parcela' ? 'Cargando…' : 'Cargar la parcela actual del Catastro'}</button>
      <button disabled={!valid || !!busy} onClick={() => void loadNeighbours()}>{busy === 'colindantes' ? 'Buscando colindantes…' : 'Buscar colindantes'}</button>

      {neigh.length > 0 && (
        <>
          <h3>Colindantes ({neigh.length})</h3>
          <table className="grid">
            <thead><tr><th>Nº</th><th>Referencia</th><th>Localización</th><th className="n">m²</th></tr></thead>
            <tbody>
              {neigh.map((n, i) => (
                <tr key={n.refcat}><td>{i + 1}</td><td><code>{n.refcat}</code></td><td>{n.direccion ?? '…'}{n.uso ? ` · ${n.uso}` : ''}</td><td className="n">{(n.superficie ?? totalArea(n.polygons)).toFixed(0)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="two">
            <button onClick={csv}>Lista en CSV (Excel)</button>
            <button disabled={!!busy} onClick={() => void report()}>{busy === 'pdf' ? 'Generando…' : 'Informe PDF'}</button>
          </div>
          <p className="hint">Los titulares son datos protegidos: se obtienen con la certificación catastral.</p>
        </>
      )}
    </div>
  );
}
