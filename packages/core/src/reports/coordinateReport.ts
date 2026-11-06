import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { CRS_DEFS } from '../crs.js';
import { areaSummary, vertexTable } from '../io/csv.js';
import type { ReportData, Person } from './data.js';
import { planSvg } from './svg.js';

export const nf = (n: number, d = 2) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Coordenadas sin separador de miles, como en los listados técnicos. */
export const cf = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

export function fechaLarga(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function personBlock(title: string, p?: Person): Content[] {
  if (!p) return [];
  const lines = [
    p.nombre,
    p.nif && `NIF: ${p.nif}`,
    p.titulacion,
    p.colegio && `${p.colegio}${p.numeroColegiado ? `, n.º ${p.numeroColegiado}` : ''}`,
    p.direccion,
    [p.email, p.telefono].filter(Boolean).join(' · ') || undefined,
  ].filter(Boolean) as string[];
  return [{ text: title, style: 'label' }, { text: lines.join('\n'), margin: [0, 0, 0, 8] }];
}

/**
 * Informe de coordenadas georreferenciadas (definición pdfmake).
 * La web y el escritorio la convierten en PDF con pdfmake; ver `renderPdf`.
 */
export function coordinateReportDefinition(data: ReportData): TDocumentDefinitions {
  const dec = data.coordDecimals ?? 2;
  const rows = vertexTable(data.recintos);
  const summary = areaSummary(data.recintos);
  const crs = `EPSG:${data.epsg} · ${CRS_DEFS[data.epsg]?.name ?? ''}`;
  const svg = planSvg([
    ...(data.referenciaCatastral ? [{ polygons: data.referenciaCatastral.flatMap((r) => r.polygons), stroke: '#c0392b' }] : []),
    { polygons: data.recintos.flatMap((r) => r.polygons), stroke: '#1f4e8c', fill: 'rgba(31,78,140,0.12)', numberVertices: true },
  ]);
  const vertexBody = [
    ['Recinto', 'Vértice', 'X (m)', 'Y (m)', 'Lado (m)'].map((t) => ({ text: t, style: 'th' })),
    ...rows.map((r) => [
      r.anillo === 'interior' ? `${r.recinto} (int.)` : r.recinto,
      String(r.vertice),
      { text: cf(r.x, dec), alignment: 'right' as const },
      { text: cf(r.y, dec), alignment: 'right' as const },
      { text: nf(r.lado), alignment: 'right' as const },
    ]),
  ];
  const summaryBody = [
    ['Recinto', 'Superficie (m²)', 'Perímetro (m)', 'Vértices'].map((t) => ({ text: t, style: 'th' })),
    ...summary.map((s) => [s.recinto, { text: nf(s.superficie), alignment: 'right' as const }, { text: nf(s.perimetro), alignment: 'right' as const }, { text: String(s.vertices), alignment: 'right' as const }]),
  ];
  const total = summary.reduce((s, r) => s + r.superficie, 0);
  const errors = (data.issues ?? []).filter((i) => i.severity === 'error');
  const warnings = (data.issues ?? []).filter((i) => i.severity === 'warning');
  const validation: Content = data.issues
    ? {
        stack: [
          { text: 'Validación previa', style: 'h2' },
          errors.length === 0
            ? { text: 'Sin errores. La geometría cumple las comprobaciones previas de la validación gráfica del Catastro.', margin: [0, 0, 0, 4] }
            : { text: `${errors.length} error(es) que impedirán la validación gráfica:`, color: '#c0392b', margin: [0, 0, 0, 4] },
          { ul: [...errors, ...warnings].map((i) => `${i.severity === 'error' ? 'Error' : 'Aviso'}: ${i.message}`) },
        ],
      }
    : '';
  return {
    pageSize: 'A4',
    pageMargins: [48, 56, 48, 56],
    info: { title: data.titulo ?? 'Informe de coordenadas georreferenciadas', author: data.autor.nombre },
    header: (page) => ({ text: data.referencia, alignment: 'right', fontSize: 8, color: '#777', margin: [0, 24, 48, 0], ...(page === 1 ? { text: '' } : {}) }),
    footer: (page, pages) => ({ text: `Página ${page} de ${pages}`, alignment: 'center', fontSize: 8, color: '#777', margin: [0, 16, 0, 0] }),
    content: [
      ...(data.logo ? [{ image: data.logo, width: 90, margin: [0, 0, 0, 12] } as Content] : []),
      { text: data.titulo ?? 'Informe de coordenadas georreferenciadas', style: 'h1' },
      {
        columns: [
          { width: '*', stack: personBlock('Técnico', data.autor) },
          { width: '*', stack: personBlock('Cliente', data.cliente) },
        ],
      },
      { text: 'Datos del recinto', style: 'h2' },
      {
        table: {
          widths: [130, '*'],
          body: [
            ['Referencia', data.referencia],
            ...(data.actuacion ? [['Actuación', data.actuacion]] : []),
            ...(data.direccion ? [['Dirección', data.direccion]] : []),
            ...(data.municipio ? [['Municipio', `${data.municipio}${data.provincia ? ` (${data.provincia})` : ''}`]] : []),
            ['Sistema de referencia', crs],
            ['Superficie total', `${nf(total)} m²`],
          ].map(([a, b]) => [{ text: a!, style: 'label' }, b!]),
        },
        layout: 'lightHorizontalLines',
      },
      { text: 'Plano', style: 'h2' },
      { svg, width: 490 },
      ...(data.referenciaCatastral ? [{ text: 'Azul: recinto medido. Rojo: parcela según Catastro.', fontSize: 8, color: '#555', margin: [0, 4, 0, 0] } as Content] : []),
      { text: 'Superficies', style: 'h2', pageBreak: 'before' },
      { table: { headerRows: 1, widths: ['*', 90, 90, 60], body: summaryBody }, layout: 'lightHorizontalLines' },
      { text: 'Coordenadas de los vértices', style: 'h2' },
      { table: { headerRows: 1, widths: ['*', 50, 90, 90, 60], body: vertexBody }, layout: 'lightHorizontalLines', fontSize: 9 },
      validation,
      ...(data.observaciones ? [{ text: 'Observaciones', style: 'h2' } as Content, { text: data.observaciones }] : []),
      {
        unbreakable: true,
        stack: [
          { text: `${data.lugar ? data.lugar + ', ' : ''}${fechaLarga(data.fecha)}`, margin: [0, 28, 0, 48] },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }] },
          { text: `Fdo.: ${data.autor.nombre}`, margin: [0, 4, 0, 0] },
          ...(data.autor.titulacion ? [{ text: data.autor.titulacion, fontSize: 9, color: '#555' } as Content] : []),
        ],
      },
    ],
    styles: {
      h1: { fontSize: 16, bold: true, margin: [0, 0, 0, 14] },
      h2: { fontSize: 12, bold: true, margin: [0, 14, 0, 6] },
      th: { bold: true, fillColor: '#eef2f7' },
      label: { bold: true, fontSize: 9, color: '#444' },
    },
    defaultStyle: { fontSize: 10, font: 'Roboto' },
  };
}
