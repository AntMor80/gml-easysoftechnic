# GML EasySoftechnic

Aplicación para crear, validar, editar y exportar GML catastrales (parcelas y edificios) en tres versiones que comparten el mismo motor:

| Carpeta | Qué es | Estado |
| --- | --- | --- |
| `packages/core` | Motor común en TypeScript: lectura y escritura de GML (v3 y v4), DXF, CSV y TXT; validación previa; coordenadas; líneas ↔ superficies | En desarrollo (fase 2) |
| `apps/web` | Aplicación web (React + OpenLayers) para app.easysoftechnic.com | Fase 3 |
| `apps/desktop` | Programa de Windows (Electron) con módulos con licencia | Fase 3 |
| `apps/server` | Servidor de cuentas, bonos de créditos y licencias (Node.js + MySQL en Hostinger) | Fase 3 |
| `plugins/qgis` | Complemento de QGIS en Python | Fase 3 |

La especificación completa (módulos, pagos, licencias y arquitectura) está en el documento de especificación del proyecto; el resumen técnico está en [docs/arquitectura.md](docs/arquitectura.md).

## Probar el motor

```bash
npm install
npm test
```

Requiere Node.js 20 o superior.
