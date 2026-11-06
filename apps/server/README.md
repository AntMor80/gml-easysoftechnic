# Servidor de cuentas, créditos y licencias

Node.js + Express + MySQL. Hace cuatro cosas y nada más (todo el trabajo con GML ocurre en el navegador):

1. **Cuentas**: registro, acceso, cierre de sesión y recuperación de contraseña por correo.
2. **Créditos de la web**: saldo, cobro por actuación (`CREDIT_COST` en `packages/core/src/commerce.ts`) y compra de bonos con Stripe.
3. **Licencias de escritorio**: compra por módulos (anual, bianual o de por vida), clave `GML-XXXX-XXXX-XXXX-XXXX`, activación en 2 equipos y certificado firmado (Ed25519) que vale 30 días sin conexión.
4. **Sirve la web** compilada (`apps/web/dist`), así web y servidor comparten dirección y la sesión va en una cookie.

Precios, bonos y módulos están en un solo sitio: `packages/core/src/commerce.ts` (**provisionales**).

## Probar en local

```bash
npm install
npm run build:prod                 # compila la web y el servidor
JWT_SECRET=prueba npm start        # sin DB_HOST guarda en memoria (se borra al cerrar)
```

Abre http://localhost:3000. Sin Stripe configurado la compra aparece desactivada; con `ADMIN_EMAILS=tu@correo` puedes regalarte créditos y licencias desde *Mi cuenta*.

Pruebas: `npm test -w @gml/server` (en memoria) o, con un MySQL de pruebas, `TEST_DB=mysql://usuario:clave@localhost/base npm test -w @gml/server`.

## Publicar en Hostinger (plan Business)

1. **Subdominio**: hPanel > Dominios > Subdominios > crear `app.easysoftechnic.com`.
2. **Base de datos**: hPanel > Bases de datos > Administración > crear base de datos y usuario. Abrir phpMyAdmin e importar `apps/server/schema.sql`.
3. **Correo**: crear un buzón (p. ej. `no-responder@easysoftechnic.com`) para las recuperaciones de contraseña y el envío de licencias.
4. **Clave de licencias**: en tu PC, `npm run keys -w @gml/server`. La línea `LICENSE_PRIVATE_KEY=...` va al servidor; la clave pública sustituye a `apps/desktop/licencia-publica.pem` y a `plugins/qgis/gml_easysoftechnic/licencia-publica.pem`.
5. **Aplicación Node.js**: hPanel > Sitios web > añadir sitio > *Node.js* (Web Apps), en el subdominio. Conectar el repositorio de GitHub (o subir el ZIP) y poner:
   - Versión de Node: 18 o superior
   - Comando de instalación/compilación: `npm install && npm run build:prod`
   - Archivo de inicio: `apps/server/dist/server.js` (o comando `npm start`)
   - Variables de entorno: las de `.env.example`
6. **Stripe**: en el panel de Stripe crear el webhook `https://app.easysoftechnic.com/api/stripe/webhook` con el evento `checkout.session.completed` y copiar su secreto en `STRIPE_WEBHOOK_SECRET`. Probar primero con las claves de prueba (`sk_test_...`) y la tarjeta 4242 4242 4242 4242.
7. Enlazar `https://app.easysoftechnic.com` desde la web principal.

Los nombres exactos de los menús de hPanel pueden variar; si algo no coincide, el asistente de Hostinger lo localiza por "Node.js".

## API

| Ruta | Para qué |
|---|---|
| `GET /api/catalog` | Precios, bonos, módulos y planes |
| `POST /api/auth/register` · `login` · `logout` · `forgot` · `reset` | Cuentas |
| `GET /api/me` | Usuario, saldo y licencias con sus equipos |
| `POST /api/credits/spend` `{action}` | Cobra una actuación (402 si no hay saldo) |
| `GET /api/credits/history` | Movimientos |
| `POST /api/checkout` `{kind:'bundle',id}` o `{kind:'license',modules,plan}` | Abre el pago de Stripe |
| `POST /api/stripe/webhook` | Aviso de Stripe: entrega créditos o licencia (una sola vez) |
| `POST /api/licenses/activate` · `refresh` · `deactivate` `{key, machineId}` | Aplicación de escritorio |
| `POST /api/licenses/release` | El dueño libera un equipo desde la web |
| `POST /api/admin/credits` · `/api/admin/license` | Administración (correos de `ADMIN_EMAILS`) |
