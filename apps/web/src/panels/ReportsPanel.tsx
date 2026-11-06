import { useEffect, useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import {
  coordinateReportDefinition, coordinateReportDocx, docxToBuffer, graphicRepresentationDefinition, isValidCadastralReference,
  surfaceCertificateDefinition, validationReportDefinition, writeBuildingGml, writeParcelGml, coordinatesWorkbook, vertexTable,
  vertexTableCsv, toKml, type ReportData,
} from '@gml/core';
import type { State } from '../lib/state';
import { download, safeName } from '../lib/download';
import { pdfBlob } from '../lib/pdf';
import { spend } from '../lib/credits';
import { runValidation } from './ValidationPanel';

const KEY = 'gml-easysoftechnic:autor';

interface Form {
  nombre: string; titulacion: string; colegio: string; numeroColegiado: string; email: string; telefono: string;
  cliente: string; referencia: string; municipio: string; provincia: string; actuacion: string; lugar: string;
  superficieRegistral: string; fincaRegistral: string; registro: string; observaciones: string;
}

const empty: Form = { nombre: '', titulacion: 'Arquitecto', colegio: '', numeroColegiado: '', email: '', telefono: '', cliente: '', referencia: '', municipio: '', provincia: '', actuacion: '', lugar: '', superficieRegistral: '', fincaRegistral: '', registro: '', observaciones: '' };

function loadAuthor(): Partial<Form> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Form>; } catch { return {}; }
}

export function ReportsPanel({ state }: { state: State }) {
  const [f, setF] = useState<Form>({ ...empty, ...loadAuthor() });
  const [busy, setBusy] = useState('');
  useEffect(() => {
    try {
      const { nombre, titulacion, colegio, numeroColegiado, email, telefono } = f;
      localStorage.setItem(KEY, JSON.stringify({ nombre, titulacion, colegio, numeroColegiado, email, telefono }));
    } catch { /* sin almacenamiento local */ }
  }, [f]);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const main = state.items.filter((i) => i.role !== 'referencia' && i.visible);
  const refs = state.items.filter((i) => i.role === 'referencia');

  const data = (): ReportData => {
    const issues = runValidation(state, 0.005).flatMap((x) => x.issues);
    return {
      autor: { nombre: f.nombre || 'Técnico', titulacion: f.titulacion, colegio: f.colegio, numeroColegiado: f.numeroColegiado, email: f.email, telefono: f.telefono },
      cliente: f.cliente ? { nombre: f.cliente } : undefined,
      referencia: f.referencia || main[0]?.id || 'Sin referencia',
      municipio: f.municipio || undefined, provincia: f.provincia || undefined, actuacion: f.actuacion || undefined, lugar: f.lugar || undefined,
      epsg: state.epsg,
      recintos: main.map((i) => ({ id: i.id, polygons: i.polygons })),
      referenciaCatastral: refs.length ? refs.map((i) => ({ id: i.id, polygons: i.polygons })) : undefined,
      issues,
      observaciones: f.observaciones || undefined,
    };
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } finally { setBusy(''); }
  };
  const base = safeName(f.referencia || main[0]?.id || 'informe');
  const extra = { superficieRegistral: f.superficieRegistral ? Number(f.superficieRegistral.replace(',', '.')) : undefined };

  const reports = [
    { label: 'Informe de coordenadas (PDF)', go: async () => download(`${base}_informe_coordenadas.pdf`, await pdfBlob(coordinateReportDefinition(data()))) },
    { label: 'Informe de coordenadas (Word)', go: async () => download(`${base}_informe_coordenadas.docx`, await docxToBuffer(coordinateReportDocx(data())), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') },
    { label: 'Informe de validación (PDF)', go: async () => download(`${base}_validacion.pdf`, await pdfBlob(validationReportDefinition({ ...data(), archivos: [...new Set(state.items.map((i) => i.source))] }))) },
    { label: 'Certificado de superficies (PDF)', go: async () => download(`${base}_certificado_superficies.pdf`, await pdfBlob(surfaceCertificateDefinition({ ...data(), ...extra }))) },
    { label: 'Representación gráfica para notaría y registro (PDF)', go: async () => download(`${base}_representacion_grafica.pdf`, await pdfBlob(graphicRepresentationDefinition({ ...data(), fincaRegistral: f.fincaRegistral || undefined, registro: f.registro || undefined }))) },
  ];

  const paquete = async () => {
    if (!(await spend('paqueteDxf'))) return;
    const d = data();
    const E = state.epsg;
    const parcels = state.items.filter((i) => i.role === 'parcela');
    const builds = state.items.filter((i) => i.role === 'edificio');
    const pools = state.items.filter((i) => i.role === 'piscina');
    const files: Record<string, Uint8Array> = {};
    if (parcels.length) files[`${base}_parcela.gml`] = strToU8(writeParcelGml(parcels.map((p) => ({ id: p.id, namespace: isValidCadastralReference(p.id) ? 'ES.SDGC.CP' : 'ES.LOCAL.CP', polygons: p.polygons })), { epsg: E }));
    if (builds.length || pools.length) files[`${base}_edificio.gml`] = strToU8(writeBuildingGml(builds.map((b) => ({ id: b.id, polygons: b.polygons, numberOfFloorsAboveGround: 1, conditionOfConstruction: 'functional' })), pools.map((p) => ({ id: p.id, polygons: p.polygons })), { epsg: E }));
    files['coordenadas.csv'] = strToU8(vertexTableCsv(vertexTable(d.recintos), { epsg: E }));
    files['coordenadas.xlsx'] = coordinatesWorkbook(d.recintos, E);
    files['recintos.kml'] = strToU8(toKml(d.recintos, E));
    const pdf = async (def: Parameters<typeof pdfBlob>[0]) => new Uint8Array(await (await pdfBlob(def)).arrayBuffer());
    files['informe_coordenadas.pdf'] = await pdf(coordinateReportDefinition(d));
    files['informe_coordenadas.docx'] = await docxToBuffer(coordinateReportDocx(d));
    files['informe_validacion.pdf'] = await pdf(validationReportDefinition(d));
    files['certificado_superficies.pdf'] = await pdf(surfaceCertificateDefinition({ ...d, ...extra }));
    files['representacion_grafica.pdf'] = await pdf(graphicRepresentationDefinition({ ...d, fincaRegistral: f.fincaRegistral || undefined, registro: f.registro || undefined }));
    download(`${base}_paquete_catastro.zip`, zipSync(files), 'application/zip');
  };

  return (
    <div className="panel">
      <h3>Técnico</h3>
      <p className="hint">Se recuerdan en este navegador para los próximos informes.</p>
      <input placeholder="Nombre y apellidos" value={f.nombre} onChange={set('nombre')} />
      <div className="two"><input placeholder="Titulación" value={f.titulacion} onChange={set('titulacion')} /><input placeholder="N.º colegiado" value={f.numeroColegiado} onChange={set('numeroColegiado')} /></div>
      <input placeholder="Colegio profesional" value={f.colegio} onChange={set('colegio')} />
      <div className="two"><input placeholder="Email" value={f.email} onChange={set('email')} /><input placeholder="Teléfono" value={f.telefono} onChange={set('telefono')} /></div>
      <h3>Trabajo</h3>
      <input placeholder="Cliente" value={f.cliente} onChange={set('cliente')} />
      <input placeholder="Referencia catastral" value={f.referencia} onChange={set('referencia')} />
      <div className="two"><input placeholder="Municipio" value={f.municipio} onChange={set('municipio')} /><input placeholder="Provincia" value={f.provincia} onChange={set('provincia')} /></div>
      <div className="two"><input placeholder="Actuación (segregación…)" value={f.actuacion} onChange={set('actuacion')} /><input placeholder="Lugar de firma" value={f.lugar} onChange={set('lugar')} /></div>
      <div className="two"><input placeholder="Sup. registral (m²)" value={f.superficieRegistral} onChange={set('superficieRegistral')} /><input placeholder="Finca registral" value={f.fincaRegistral} onChange={set('fincaRegistral')} /></div>
      <input placeholder="Registro de la Propiedad" value={f.registro} onChange={set('registro')} />
      <textarea placeholder="Observaciones" value={f.observaciones} onChange={set('observaciones')} rows={2} />
      <h3>Documentos</h3>
      {refs.length === 0 && <p className="hint">Marca un recinto como «Referencia» para compararlo con el Catastro en los informes.</p>}
      {reports.map((r) => (
        <button key={r.label} disabled={!main.length || !!busy} onClick={() => run(r.label, async () => { if (await spend('informe')) await r.go(); })}>{busy === r.label ? 'Generando…' : r.label}</button>
      ))}
      <button className="primary" disabled={!main.length || !!busy} onClick={() => run('paquete', paquete)}>{busy === 'paquete' ? 'Generando paquete…' : 'Paquete completo del trámite (ZIP)'}</button>
      <p className="hint">El paquete incluye GML de parcela y edificio, CSV, Excel, KML y los cinco documentos.</p>
    </div>
  );
}
