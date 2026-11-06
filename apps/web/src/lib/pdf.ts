import type { TDocumentDefinitions } from 'pdfmake/interfaces';

/** Convierte una definición del motor en PDF (pdfmake se carga solo cuando hace falta). */
export async function pdfBlob(def: TDocumentDefinitions): Promise<Blob> {
  const [{ default: pdfMake }, vfsMod] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const m = pdfMake as unknown as { vfs: unknown; createPdf: (d: TDocumentDefinitions) => { getBlob: (cb: (b: Blob) => void) => void } };
  const v = vfsMod as unknown as { default?: unknown; pdfMake?: { vfs: unknown }; vfs?: unknown };
  m.vfs = v.pdfMake?.vfs ?? v.vfs ?? (v.default as { pdfMake?: { vfs: unknown } })?.pdfMake?.vfs ?? v.default;
  return new Promise((res) => m.createPdf(def).getBlob(res));
}
