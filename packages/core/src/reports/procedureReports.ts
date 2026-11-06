import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { CRS_DEFS } from '../crs.js';
import { totalArea } from '../geometry.js';
import { vertexTable } from '../io/csv.js';
import type { Polygon } from '../types.js';
import { cf, fechaLarga, nf, personBlock } from './coordinateReport.js';
import type { ReportData } from './data.js';
import { planSvg } from './svg.js';

const styles = {
  h1: { fontSize: 16, bold: true, margin: [0, 0, 0, 14] as [number, number, number, number] },
  h2: { fontSize: 12, bold: true, margin: [0, 14, 0, 6] as [number, number, number, number] },
  th: { bold: true, fillColor: '#eef2f7' },
  label: { bold: true, fontSize: 9, color: '#444' },
  note: { fontSize: 8, color: '#555' },
};

function frame(data: ReportData, title: string, body: Content[]): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [48, 56, 48, 56],
    info: { title, author: data.autor.nombre },
    footer: (page, pages) => ({ text: `${data.referencia} · Página ${page} de ${pages}`, alignment: 'center', fontSize: 8, color: '#777', margin: [0, 16, 0, 0] }),
    content: [
      ...(data.logo ? [{ image: data.logo, width: 90, margin: [0, 0, 0, 12] } as Content] : []),
      { text: title, style: 'h1' },
      { columns: [{ width: '*', stack: personBlock('Técnico', data.autor) }, { width: '*', stack: personBlock('Cliente', data.cliente) }] },
      ...body,
      signature(data),
    ],
    styles,
    defaultStyle: { fontSize: 10, font: 'Roboto' },
  };
}

function signature(data: ReportData): Content {
  return {
    unbreakable: true,
    stack: [
      { text: `${data.lugar ? data.lugar + ', ' : ''}${fechaLarga(data.fecha)}`, margin: [0, 28, 0, 48] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5 }] },
      { text: `Fdo.: ${data.autor.nombre}`, margin: [0, 4, 0, 0] },
      ...(data.autor.titulacion ? [{ text: data.autor.titulacion, fontSize: 9, color: '#555' } as Content] : []),
    ],
  };
}

function dataTable(rows: [string, string][]): Content {
  return { table: { widths: [150, '*'], body: rows.map(([a, b]) => [{ text: a, style: 'label' }, b]) }, layout: 'lightHorizontalLines' };
}

function baseRows(data: ReportData): [string, string][] {
  return [
    ['Referencia', data.referencia],
    ...(data.actuacion ? [['Actuación', data.actuacion] as [string, string]] : []),
    ...(data.direccion ? [['Dirección', data.direccion] as [string, string]] : []),
    ...(data.municipio ? [['Municipio', `${data.municipio}${data.provincia ? ` (${data.provincia})` : ''}`] as [string, string]] : []),
    ['Sistema de referencia', `EPSG:${data.epsg} · ${CRS_DEFS[data.epsg]?.name ?? ''}`],
  ];
}

/** Informe de validación previa: errores y avisos con su ubicación en el plano. */
export function validationReportDefinition(data: ReportData & { archivos?: string[] }): TDocumentDefinitions {
  const issues = data.issues ?? [];
  const errors = issues.filter((i) => i.severity === 'error');
  const markers = issues.flatMap((i) => (i.point ? [i.point] : []));
  const verdict = errors.length === 0
    ? { text: 'Resultado: sin errores. La geometría supera las comprobaciones previas.', bold: true, color: '#1e7d32' }
    : { text: `Resultado: ${errors.length} error(es). Corríjalos antes de presentar el GML.`, bold: true, color: '#c0392b' };
  return frame(data, 'Informe de validación previa', [
    { text: 'Datos', style: 'h2' },
    dataTable([...baseRows(data), ...(data.archivos?.length ? [['Archivos revisados', data.archivos.join(', ')] as [string, string]] : [])]),
    { text: verdict.text, bold: true, color: verdict.color, margin: [0, 12, 0, 0] },
    { text: 'Plano', style: 'h2' },
    {
      svg: planSvg([
        ...(data.referenciaCatastral ? [{ polygons: data.referenciaCatastral.flatMap((r) => r.polygons), stroke: '#888' }] : []),
        { polygons: data.recintos.flatMap((r) => r.polygons), stroke: '#1f4e8c', fill: 'rgba(31,78,140,0.10)', numberVertices: true, markers },
      ]),
      width: 490,
    },
    { text: 'Los círculos rojos señalan la ubicación de cada problema.', style: 'note', margin: [0, 4, 0, 0] },
    { text: 'Comprobaciones', style: 'h2' },
    issues.length
      ? {
          table: {
            headerRows: 1,
            widths: [50, '*', 130],
            body: [
              ['Tipo', 'Descripción', 'Ubicación (X, Y)'].map((t) => ({ text: t, style: 'th' })),
              ...issues.map((i) => [
                { text: i.severity === 'error' ? 'Error' : 'Aviso', color: i.severity === 'error' ? '#c0392b' : '#b26a00' },
                i.message,
                i.point ? `${cf(i.point[0])} ; ${cf(i.point[1])}` : '',
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        }
      : { text: 'No se ha encontrado ningún problema.' },
    {
      text: 'Comprobaciones realizadas: recintos cerrados, número mínimo de vértices, vértices repetidos, autointersecciones, orientación de anillos, interiores dentro del exterior, superficie no nula y solapes entre recintos. Este informe no sustituye a la validación gráfica oficial de la Sede Electrónica del Catastro.',
      style: 'note',
      margin: [0, 10, 0, 0],
    },
  ]);
}

/** Certificado de superficies: medición frente a la superficie catastral. */
export function surfaceCertificateDefinition(data: ReportData & { superficieCatastral?: number; superficieRegistral?: number }): TDocumentDefinitions {
  const medida = data.recintos.reduce((s, r) => s + totalArea(r.polygons), 0);
  const catastral = data.superficieCatastral ?? (data.referenciaCatastral ? data.referenciaCatastral.reduce((s, r) => s + totalArea(r.polygons), 0) : undefined);
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${nf(n)}`;
  const rows: string[][] = [
    ['Superficie catastral', catastral],
    ['Superficie registral', data.superficieRegistral],
  ]
    .filter((r): r is [string, number] => r[1] !== undefined)
    .map(([label, ref]) => [label, `${nf(ref)} m²`, `${signed(medida - ref)} m²`, `${signed(((medida - ref) / ref) * 100)} %`]);
  const maxPct = Math.max(
    ...[catastral, data.superficieRegistral].filter((v): v is number => v !== undefined).map((ref) => Math.abs(((medida - ref) / ref) * 100)),
    0,
  );
  return frame(data, 'Certificado de superficies', [
    { text: 'Datos del inmueble', style: 'h2' },
    dataTable(baseRows(data)),
    {
      text: `El técnico que suscribe CERTIFICA que, según la medición realizada, la superficie del recinto es de ${nf(medida)} m².`,
      margin: [0, 14, 0, 0],
    },
    { text: 'Comparación', style: 'h2' },
    {
      table: {
        headerRows: 1,
        widths: ['*', 90, 90, 70],
        body: [
          ['Concepto', 'Superficie', 'Diferencia', '%'].map((t) => ({ text: t, style: 'th' })),
          ['Superficie medida', `${nf(medida)} m²`, '', ''],
          ...rows,
        ],
      },
      layout: 'lightHorizontalLines',
    },
    ...(maxPct > 10
      ? [{ text: `La diferencia supera el 10 % (${nf(maxPct)} %). Revise el procedimiento catastral y registral aplicable a esta rectificación.`, color: '#b26a00', margin: [0, 8, 0, 0] } as Content]
      : []),
    { text: 'Plano', style: 'h2' },
    {
      svg: planSvg([
        ...(data.referenciaCatastral ? [{ polygons: data.referenciaCatastral.flatMap((r) => r.polygons), stroke: '#c0392b' }] : []),
        { polygons: data.recintos.flatMap((r) => r.polygons), stroke: '#1f4e8c', fill: 'rgba(31,78,140,0.12)', numberVertices: true },
      ]),
      width: 490,
    },
    ...(data.referenciaCatastral ? [{ text: 'Azul: recinto medido. Rojo: parcela según Catastro.', style: 'note', margin: [0, 4, 0, 0] } as Content] : []),
    ...(data.observaciones ? [{ text: 'Observaciones', style: 'h2' } as Content, { text: data.observaciones }] : []),
  ]);
}

/**
 * Documento de representación gráfica georreferenciada para notaría y Registro
 * de la Propiedad: identificación de la finca, plano, superficie y listado de
 * coordenadas, con un texto de declaración que el técnico puede editar.
 */
export function graphicRepresentationDefinition(
  data: ReportData & {
    fincaRegistral?: string;
    registro?: string;
    titulares?: string[];
    colindantes?: { lindero: string; referencia: string; titular?: string }[];
    declaracion?: string;
    resultantes?: { id: string; polygons: Polygon[] }[];
  },
): TDocumentDefinitions {
  const fincas = data.resultantes ?? data.recintos;
  const rows = vertexTable(fincas);
  const declaracion =
    data.declaracion ??
    'El técnico que suscribe declara que la representación gráfica que se acompaña se ha obtenido por medición directa, que está georreferenciada en el sistema oficial indicado y que el archivo GML que la contiene cumple el formato exigido por la Dirección General del Catastro.';
  return frame(data, 'Representación gráfica georreferenciada', [
    { text: 'Identificación de la finca', style: 'h2' },
    dataTable([
      ...baseRows(data),
      ...(data.fincaRegistral ? [['Finca registral', data.fincaRegistral] as [string, string]] : []),
      ...(data.registro ? [['Registro de la Propiedad', data.registro] as [string, string]] : []),
      ...(data.titulares?.length ? [['Titulares', data.titulares.join('\n')] as [string, string]] : []),
    ]),
    { text: 'Superficies', style: 'h2' },
    {
      table: {
        headerRows: 1,
        widths: ['*', 110],
        body: [['Finca', 'Superficie'].map((t) => ({ text: t, style: 'th' })), ...fincas.map((f) => [f.id, `${nf(totalArea(f.polygons))} m²`])],
      },
      layout: 'lightHorizontalLines',
    },
    ...(data.colindantes?.length
      ? [
          { text: 'Colindantes', style: 'h2' } as Content,
          {
            table: {
              headerRows: 1,
              widths: [70, 140, '*'],
              body: [['Lindero', 'Referencia catastral', 'Titular'].map((t) => ({ text: t, style: 'th' })), ...data.colindantes.map((c) => [c.lindero, c.referencia, c.titular ?? ''])],
            },
            layout: 'lightHorizontalLines',
          } as Content,
        ]
      : []),
    { text: 'Plano', style: 'h2', pageBreak: 'before' },
    {
      svg: planSvg([
        ...(data.referenciaCatastral ? [{ polygons: data.referenciaCatastral.flatMap((r) => r.polygons), stroke: '#c0392b' }] : []),
        ...fincas.map((f, i) => ({ polygons: f.polygons, stroke: ['#1f4e8c', '#2e7d32', '#6a1b9a', '#b26a00'][i % 4]!, fill: 'rgba(31,78,140,0.08)', numberVertices: true })),
      ]),
      width: 490,
    },
    { text: 'Coordenadas', style: 'h2' },
    {
      table: {
        headerRows: 1,
        widths: ['*', 50, 90, 90],
        body: [
          ['Finca', 'Vértice', 'X (m)', 'Y (m)'].map((t) => ({ text: t, style: 'th' })),
          ...rows.map((r) => [r.anillo === 'interior' ? `${r.recinto} (int.)` : r.recinto, String(r.vertice), { text: cf(r.x, data.coordDecimals ?? 2), alignment: 'right' as const }, { text: cf(r.y, data.coordDecimals ?? 2), alignment: 'right' as const }]),
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 9,
    },
    { text: 'Declaración', style: 'h2' },
    { text: declaracion },
  ]);
}

export interface Colindante {
  refcat: string;
  polygons: Polygon[];
  direccion?: string;
  uso?: string;
  superficie?: number;
}

/**
 * Relación de colindantes: parcelas catastrales vecinas con su referencia, localización,
 * uso y superficie (datos públicos del Catastro; los titulares no son públicos y se
 * obtienen con la certificación catastral).
 */
export function colindantesReportDefinition(data: ReportData & { colindantes: Colindante[]; direccionPrincipal?: string }): TDocumentDefinitions {
  const palette = ['#c0392b', '#2e7d32', '#8e44ad', '#d35400', '#00838f', '#6d4c41', '#ad1457', '#283593'];
  return frame(data, 'Relación de parcelas colindantes', [
    { text: 'Parcela', style: 'h2' },
    dataTable([...baseRows(data), ...(data.direccionPrincipal ? [['Localización (Catastro)', data.direccionPrincipal] as [string, string]] : [])]),
    { text: 'Plano', style: 'h2' },
    {
      svg: planSvg([
        { polygons: data.recintos.flatMap((r) => r.polygons), stroke: '#1f4e8c', fill: 'rgba(31,78,140,0.15)', label: 'P' },
        ...data.colindantes.map((c, i) => ({ polygons: c.polygons, stroke: palette[i % palette.length]!, label: String(i + 1) })),
      ]),
      width: 490,
    },
    { text: `Colindantes (${data.colindantes.length})`, style: 'h2' },
    data.colindantes.length
      ? {
          table: {
            headerRows: 1,
            widths: [18, 98, '*', 70, 52],
            body: [
              [{ text: 'Nº', style: 'th' }, { text: 'Referencia catastral', style: 'th' }, { text: 'Localización', style: 'th' }, { text: 'Uso', style: 'th' }, { text: 'Sup. (m²)', style: 'th', alignment: 'right' }],
              ...data.colindantes.map((c, i) => [
                String(i + 1),
                { text: c.refcat, fontSize: 8.5 },
                { text: c.direccion ?? '', fontSize: 8.5 },
                { text: c.uso ?? '', fontSize: 8.5 },
                { text: nf(c.superficie ?? totalArea(c.polygons), 0), alignment: 'right' as const },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        }
      : { text: 'El Catastro no ha devuelto parcelas colindantes.' },
    {
      text: 'Datos obtenidos de los servicios públicos de la Dirección General del Catastro. La identidad de los titulares es un dato protegido y debe consultarse mediante certificación catastral.',
      style: 'note',
      margin: [0, 10, 0, 0],
    },
  ]);
}
