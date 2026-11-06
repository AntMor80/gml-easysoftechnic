import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { coordinateReportDefinition, coordinateReportDocx, docxToBuffer, planSvg, validatePolygons } from '../src/index.js';
import type { ReportData } from '../src/index.js';
import type { Ring } from '../src/types.js';

const require = createRequire(import.meta.url);
const square = (x: number, y: number, s: number): Ring => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const polys = [{ exterior: square(440000, 4474000, 25), interiors: [] }];
const data: ReportData = {
  autor: { nombre: 'Técnico de Prueba', titulacion: 'Arquitecto', colegio: 'COA', numeroColegiado: '1234' },
  cliente: { nombre: 'Cliente de Prueba' },
  referencia: '1234567VK1213S',
  municipio: 'Madrid',
  provincia: 'Madrid',
  actuacion: 'Segregación',
  epsg: 25830,
  recintos: [{ id: 'Finca resultante', polygons: polys }],
  referenciaCatastral: [{ id: 'Catastro', polygons: [{ exterior: square(440001, 4474001, 25), interiors: [] }] }],
  issues: validatePolygons(polys),
  fecha: '2026-11-06',
  lugar: 'Madrid',
};

mkdirSync('test/.out', { recursive: true });

function renderPdf(def: unknown): Promise<Buffer> {
  const pdfMake = require('pdfmake/build/pdfmake.js');
  const vfs = require('pdfmake/build/vfs_fonts.js');
  pdfMake.vfs = vfs.pdfMake?.vfs ?? vfs.vfs ?? vfs;
  return new Promise((res) => pdfMake.createPdf(def).getBuffer((b: Uint8Array) => res(Buffer.from(b))));
}

describe('informes', () => {
  it('dibuja el plano con vértices numerados, escala y norte', () => {
    const svg = planSvg([{ polygons: polys, stroke: '#00f', numberVertices: true }]);
    expect(svg.match(/<circle/g)).toHaveLength(4);
    expect(svg).toContain(' m</text>');
  });

  it('genera el informe de coordenadas en PDF', async () => {
    const pdf = await renderPdf(coordinateReportDefinition(data));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    writeFileSync('test/.out/informe_coordenadas.pdf', pdf);
  }, 30000);

  it('genera el informe de coordenadas en Word', async () => {
    const buf = await docxToBuffer(coordinateReportDocx(data));
    const xml = strFromU8(unzipSync(buf)['word/document.xml']!);
    expect(xml).toContain('1234567VK1213S');
    expect(xml).toContain('625,00');
    writeFileSync('test/.out/informe_coordenadas.docx', buf);
  });
});
