import { useState } from 'react';
import { CATASTRO_UTM_ZONES, isValidCadastralReference, writeBuildingGml, writeParcelGml, type Building, type ConditionOfConstruction, type CurrentUse } from '@gml/core';
import type { Action, State } from '../lib/state';
import { download, safeName } from '../lib/download';
import { spend } from '../lib/credits';

const USES: { v: CurrentUse | ''; l: string }[] = [
  { v: '', l: '(sin indicar)' },
  { v: '1_residential', l: 'Residencial' },
  { v: '2_agriculture', l: 'Agricultura' },
  { v: '3_industrial', l: 'Industria' },
  { v: '4_1_office', l: 'Oficinas' },
  { v: '4_2_retail', l: 'Comercio al por menor' },
  { v: '4_3_publicServices', l: 'Servicio público' },
];

export function GmlPanel({ state, dispatch }: { state: State; dispatch: (a: Action) => void }) {
  const [coordDec, setCoordDec] = useState(2);
  const [areaDec, setAreaDec] = useState(0);
  const [floors, setFloors] = useState(1);
  const [cond, setCond] = useState<ConditionOfConstruction>('functional');
  const [use, setUse] = useState<CurrentUse | ''>('1_residential');
  const [year, setYear] = useState('');
  const [gfa, setGfa] = useState('');
  const [dwellings, setDwellings] = useState('');
  const parcels = state.items.filter((i) => i.role === 'parcela');
  const buildings = state.items.filter((i) => i.role === 'edificio');
  const pools = state.items.filter((i) => i.role === 'piscina');
  const errors = state.issues.reduce((s, x) => s + x.issues.filter((i) => i.severity === 'error').length, 0);

  const parcelGml = async () => {
    if (!(await spend('gmlParcela'))) return;
    const xml = writeParcelGml(
      parcels.map((p) => ({ id: p.id, namespace: isValidCadastralReference(p.id) ? 'ES.SDGC.CP' : 'ES.LOCAL.CP', polygons: p.polygons })),
      { epsg: state.epsg, coordDecimals: coordDec, areaDecimals: areaDec },
    );
    download(`${safeName(parcels.length === 1 ? parcels[0]!.id : 'multiparcela')}.gml`, xml, 'application/gml+xml');
  };

  const buildingGml = async () => {
    if (!(await spend('gmlEdificio'))) return;
    const id = buildings[0]?.id ?? pools[0]?.id ?? 'EDIFICIO';
    const b: Building[] = buildings.map((x) => ({
      id: x.id,
      polygons: x.polygons,
      numberOfFloorsAboveGround: floors,
      conditionOfConstruction: cond,
      currentUse: use || undefined,
      dateOfConstruction: year ? `${year}-01-01` : undefined,
      grossFloorArea: gfa ? Number(gfa) : undefined,
      numberOfDwellings: dwellings ? Number(dwellings) : undefined,
    }));
    const xml = writeBuildingGml(b, pools.map((p) => ({ id: p.id, polygons: p.polygons })), { epsg: state.epsg, coordDecimals: coordDec });
    download(`${safeName(id)}_edificio.gml`, xml, 'application/gml+xml');
  };

  return (
    <div className="panel">
      <label>Sistema de referencia (huso)
        <select value={state.epsg} onChange={(e) => dispatch({ type: 'epsg', epsg: Number(e.target.value) })}>
          {CATASTRO_UTM_ZONES.map((z) => <option key={z.epsg} value={z.epsg}>{z.zone} · EPSG:{z.epsg}</option>)}
        </select>
      </label>
      <div className="two">
        <label>Decimales coordenadas<select value={coordDec} onChange={(e) => setCoordDec(Number(e.target.value))}>{[2, 3, 4].map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Decimales superficie<select value={areaDec} onChange={(e) => setAreaDec(Number(e.target.value))}>{[0, 1, 2, 3, 4].map((v) => <option key={v}>{v}</option>)}</select></label>
      </div>
      {errors > 0 && <p className="bad">La validación tiene {errors} error(es). El GML se puede generar, pero el Catastro lo rechazará.</p>}

      <h3>GML de parcela</h3>
      <p className="hint">{parcels.length ? `${parcels.length} parcela(s): ${parcels.map((p) => p.id).join(', ')}. Si el identificador es una referencia catastral se usa ES.SDGC.CP; si no, ES.LOCAL.CP.` : 'No hay recintos marcados como parcela.'}</p>
      <button className="primary" disabled={!parcels.length} onClick={parcelGml}>Crear GML de parcela</button>

      <h3>GML de edificio (ICUC)</h3>
      <p className="hint">{buildings.length + pools.length ? `${buildings.length} edificio(s) y ${pools.length} piscina(s).` : 'No hay recintos marcados como edificio o piscina.'}</p>
      <div className="two">
        <label>Plantas sobre rasante<input type="number" min={0} value={floors} onChange={(e) => setFloors(Number(e.target.value))} /></label>
        <label>Estado<select value={cond} onChange={(e) => setCond(e.target.value as ConditionOfConstruction)}><option value="functional">Funcional</option><option value="declined">Deficiente</option><option value="ruin">Ruina</option></select></label>
      </div>
      <label>Uso dominante<select value={use} onChange={(e) => setUse(e.target.value as CurrentUse | '')}>{USES.map((u) => <option key={u.v} value={u.v}>{u.l}</option>)}</select></label>
      <div className="two">
        <label>Año de construcción<input value={year} placeholder="opcional" onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
        <label>Sup. construida (m²)<input value={gfa} placeholder="opcional" onChange={(e) => setGfa(e.target.value.replace(/[^\d.]/g, ''))} /></label>
      </div>
      <label>Número de viviendas<input value={dwellings} placeholder="opcional" onChange={(e) => setDwellings(e.target.value.replace(/\D/g, ''))} /></label>
      <button className="primary" disabled={!buildings.length && !pools.length} onClick={buildingGml}>Crear GML de edificio</button>
      <p className="hint">Después, valida el archivo en la <a href="https://www.sedecatastro.gob.es/Accesos/SECAccValidacionesGraficas.aspx" target="_blank" rel="noreferrer">Sede Electrónica del Catastro</a>.</p>
    </div>
  );
}
