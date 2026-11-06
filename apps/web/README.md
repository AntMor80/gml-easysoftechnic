# Aplicación web

React + OpenLayers sobre el motor común (`packages/core`). Todo el procesado de GML ocurre en el navegador.

```bash
npm install          # en la raíz del repositorio
npm run dev -w @gml/web      # desarrollo en http://localhost:5173
npm run build -w @gml/web    # genera apps/web/dist
```

## Publicar en Hostinger

`apps/web/dist` es una web estática: se sube por el administrador de archivos o FTP a la carpeta del subdominio `app.easysoftechnic.com`. No necesita Node.js; el servidor de cuentas y créditos (`apps/server`) se publica aparte.

## Pestañas

| Pestaña | Qué hace |
| --- | --- |
| Archivos | Abrir GML, DXF, TXT/CSV, LIST de AutoCAD y GeoJSON; marcar cada recinto como parcela, edificio, piscina o referencia |
| Vértices | Tabla de vértices, lados, superficie y perímetro del recinto seleccionado |
| Validar | Validación previa, construcciones dentro de parcela, solapes entre colindantes, identificadores repetidos y ajuste de medianeras |
| Crear GML | GML de parcela (ES.SDGC.CP / ES.LOCAL.CP) y de edificio con atributos |
| Exportar | DXF, Shapefile, GeoPackage, KML, KMZ, GeoJSON, Excel, CSV y TXT |
| Informes | Cinco documentos en PDF/Word y paquete completo del trámite en ZIP |

Mientras no esté el servidor, la web funciona en modo desarrollo sin cobrar créditos (`src/lib/credits.ts`).
