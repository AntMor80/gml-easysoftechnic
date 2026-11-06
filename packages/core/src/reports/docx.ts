import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { CRS_DEFS } from '../crs.js';
import { areaSummary, vertexTable } from '../io/csv.js';
import type { ReportData } from './data.js';
import { fechaLarga } from './coordinateReport.js';

const nf = (n: number, d = 2) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Coordenadas sin separador de miles, como en los listados técnicos. */
const cf = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

function row(cells: string[], header = false) {
  return new TableRow({
    tableHeader: header,
    children: cells.map(
      (c, i) =>
        new TableCell({
          children: [new Paragraph({ alignment: i >= 2 && !header ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: c, bold: header, size: 18 })] })],
        }),
    ),
  });
}

/** Informe de coordenadas en Word (.docx), editable por el técnico. */
export function coordinateReportDocx(data: ReportData): Document {
  const dec = data.coordDecimals ?? 2;
  const rows = vertexTable(data.recintos);
  const summary = areaSummary(data.recintos);
  const total = summary.reduce((s, r) => s + r.superficie, 0);
  const p = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })] });
  return new Document({
    creator: data.autor.nombre,
    title: data.titulo ?? 'Informe de coordenadas georreferenciadas',
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, text: data.titulo ?? 'Informe de coordenadas georreferenciadas' }),
          p(`Técnico: ${data.autor.nombre}${data.autor.titulacion ? `, ${data.autor.titulacion}` : ''}`),
          ...(data.cliente ? [p(`Cliente: ${data.cliente.nombre}`)] : []),
          p(`Referencia: ${data.referencia}`),
          ...(data.actuacion ? [p(`Actuación: ${data.actuacion}`)] : []),
          ...(data.municipio ? [p(`Municipio: ${data.municipio}${data.provincia ? ` (${data.provincia})` : ''}`)] : []),
          p(`Sistema de referencia: EPSG:${data.epsg} ${CRS_DEFS[data.epsg]?.name ?? ''}`),
          p(`Superficie total: ${nf(total)} m²`, true),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Superficies' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [row(['Recinto', 'Vértices', 'Superficie (m²)', 'Perímetro (m)'], true), ...summary.map((s) => row([s.recinto, String(s.vertices), nf(s.superficie), nf(s.perimetro)]))],
          }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Coordenadas de los vértices' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              row(['Recinto', 'Vértice', 'X (m)', 'Y (m)', 'Lado (m)'], true),
              ...rows.map((r) => row([r.anillo === 'interior' ? `${r.recinto} (int.)` : r.recinto, String(r.vertice), cf(r.x, dec), cf(r.y, dec), nf(r.lado)])),
            ],
          }),
          ...(data.observaciones ? [new Paragraph({ heading: HeadingLevel.HEADING_2, text: 'Observaciones' }), p(data.observaciones)] : []),
          new Paragraph({ spacing: { before: 600 }, text: `${data.lugar ? data.lugar + ', ' : ''}${fechaLarga(data.fecha)}` }),
          new Paragraph({ spacing: { before: 900 }, text: `Fdo.: ${data.autor.nombre}` }),
        ],
      },
    ],
  });
}

export function docxToBuffer(doc: Document): Promise<Uint8Array> {
  return Packer.toBuffer(doc).then((b) => new Uint8Array(b));
}
