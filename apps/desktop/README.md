# Aplicación de escritorio (Windows)

Electron con la misma interfaz que la web (`apps/web/dist`), pero sin créditos: cada función se desbloquea con su **módulo** en la licencia.

- **Menú común "Módulos"**: lista los 7 módulos con ✓ (licenciado) o 🔒 (pulsa para activar o comprar).
- **Pestaña Licencia**: introducir la clave `GML-XXXX-XXXX-XXXX-XXXX`, ver módulos, caducidad y plazo sin conexión, comprobar ahora y desactivar en este equipo para pasarla a otro.
- **Sin conexión**: el servidor entrega un certificado firmado (Ed25519) que vale 30 días. Cada vez que la aplicación arranca con internet lo renueva. Sin conexión durante más de 30 días, pide conectarse.
- **2 equipos por licencia**: el tercero se rechaza hasta que se libere uno (desde la aplicación o desde *Mi cuenta* en la web).
- Ver y validar archivos es libre; crear GML, informes y exportaciones necesita el módulo correspondiente (`ACTION_MODULE` en `packages/core/src/commerce.ts`).

## Instalador

GitHub > pestaña **Actions** > **Instalador de Windows** > *Run workflow*. Al terminar, el `.exe` está en *Artifacts* de esa ejecución.

## Antes de publicar

1. Generar las claves de licencia (`npm run keys -w @gml/server`), poner la privada en el servidor y **sustituir `licencia-publica.pem`** por la pública. La que hay ahora es de desarrollo.
2. Servidor: por defecto `https://app.easysoftechnic.com` (variable `GML_SERVER` para probar con otro).
3. Firma de código (opcional pero recomendable): sin certificado, Windows SmartScreen muestra un aviso la primera vez.

## Probar en local

```bash
npm install
GML_SERVER=http://localhost:3000 npm start -w @gml/desktop
```
