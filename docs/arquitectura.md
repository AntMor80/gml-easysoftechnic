# Arquitectura

- **Todo el procesado de GML ocurre en el equipo del usuario** (navegador o programa de Windows). El servidor solo guarda cuentas, créditos y licencias, por eso cabe en el plan Business compartido de Hostinger.
- **Un único motor** (`packages/core`) se usa en la web y en el escritorio. El complemento de QGIS porta las mismas reglas a Python.
- **Pagos**: web con bonos de créditos (cada actuación gasta créditos); escritorio con licencia por módulo anual, bianual o de por vida. Cobro con Stripe.

## Módulos

| Módulo | Contenido |
| --- | --- |
| Visor (gratis) | Abrir GML, DXF, SHP, KML, GeoJSON; capas Catastro, PNOA, MTN, OSM |
| 1. GML Parcela | Crear GML de parcela (ES.SDGC.CP / ES.LOCAL.CP) |
| 2. GML Edificio | Crear GML de edificio y piscinas para el ICUC |
| 3. Operaciones parcelarias | Multiparcela, agregación, agrupación, división, segregación, v3 → v4 |
| 4. Geometría y coordenadas | Líneas ↔ superficies, curvas, husos, ED50 → ETRS89, catastro desplazado |
| 5. Conversión y exportación | DXF, SHP, GeoPackage, KML, GeoJSON, CSV, XLSX, TXT, GML |
| 6. Informes | Coordenadas georreferenciadas, informe técnico, anexos para notaría y registro |
| 7. Conexión QGIS | Complemento y exportación de proyectos .qgz |
| Paquete DXF → Catastro | Desde un DXF: GML de parcela y edificio, CSV de coordenadas y documentos del trámite |

## Pendiente de contrastar

- Plantilla del GML de edificio frente a archivos validados en la Sede del Catastro (fase 4).
- ED50 → ETRS89 con la rejilla NTv2 oficial del IGN (ahora con 7 parámetros, precisión de decímetros).
