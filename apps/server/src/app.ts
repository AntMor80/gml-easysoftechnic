import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  CREDIT_BUNDLES,
  CREDIT_ACTION_LABELS,
  CREDIT_COST,
  DESKTOP_MODULES,
  LICENSE_PLANS,
  MAX_ACTIVATIONS,
  MODULE_PRICE,
  OFFLINE_DAYS,
  isDesktopModule,
  isLicensePlan,
  licensePrice,
  type CreditAction,
  type DesktopModule,
  type LicensePlan,
} from '@gml/core/commerce';
import { catastroUrl, type CatastroQuery } from '@gml/core/catastro-urls';
import type { Config } from './config.js';
import type { License, Store, User } from './store.js';
import type { Mailer } from './mailer.js';
import type { Payments } from './payments.js';
import { licenseExpiry, newLicenseKey, offlineUntil, signLicenseToken } from './licenses.js';

export interface Deps {
  cfg: Config;
  store: Store;
  mailer: Mailer;
  payments?: Payments;
  /** Descarga de los servicios del Catastro (se sustituye en las pruebas). */
  fetchText?: (url: string) => Promise<string>;
}

async function defaultFetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'GML-EasySoftechnic' } });
  if (!res.ok) throw new HttpError(502, `El Catastro no responde (error ${res.status})`);
  return res.text();
}

const COOKIE = 'gml_sesion';
const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthedRequest = Request & { user: User };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, credits: u.credits });
const publicLicense = (l: License) => ({
  key: l.key,
  modules: l.modules,
  plan: l.plan,
  expiresAt: l.expiresAt?.toISOString() ?? null,
  revoked: l.revoked,
  createdAt: l.createdAt.toISOString(),
});

/** Envuelve un manejador asíncrono para que los errores lleguen al gestor común. */
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export function createApp({ cfg, store, mailer, payments, fetchText = defaultFetchText }: Deps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Stripe necesita el cuerpo sin procesar para comprobar la firma: va antes de express.json().
  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    h(async (req, res) => {
      if (!payments) throw new HttpError(503, 'Pagos no configurados');
      let session;
      try {
        session = payments.parseWebhook(req.body as Buffer, String(req.headers['stripe-signature'] ?? ''));
      } catch {
        throw new HttpError(400, 'Firma de Stripe no válida');
      }
      if (session) await fulfil(session.id, session.amount, session.metadata);
      res.json({ received: true });
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // ---------- sesión ----------
  const startSession = (res: Response, u: User) => {
    // Cookie solo por HTTPS cuando la petición llega cifrada (en Hostinger, a través de su proxy).
    const token = jwt.sign({ uid: u.id }, cfg.jwtSecret, { expiresIn: `${SESSION_DAYS}d` });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: res.req.secure,
      maxAge: SESSION_DAYS * 86400_000,
      path: '/',
    });
  };


  const isAdmin = (u: User) => cfg.adminEmails.includes(u.email);

  // ---------- catálogo ----------
  app.get('/api/catalog', (_req, res) => {
    res.json({
      creditCost: CREDIT_COST,
      bundles: CREDIT_BUNDLES,
      modules: DESKTOP_MODULES,
      plans: LICENSE_PLANS,
      modulePrice: MODULE_PRICE,
      maxActivations: MAX_ACTIVATIONS,
      offlineDays: OFFLINE_DAYS,
      paymentsEnabled: !!payments,
    });
  });

  // ---------- cuentas ----------
  app.post(
    '/api/auth/register',
    h(async (req, res) => {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const name = String(req.body?.name ?? '').trim().slice(0, 190);
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Correo no válido');
      if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
      if (await store.userByEmail(email)) throw new HttpError(409, 'Ya existe una cuenta con ese correo');
      const user = await store.createUser({ email, name, passwordHash: await bcrypt.hash(password, 10), credits: cfg.welcomeCredits });
      startSession(res, user);
      res.status(201).json({ user: publicUser(user) });
    }),
  );

  app.post(
    '/api/auth/login',
    h(async (req, res) => {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const user = await store.userByEmail(email);
      if (!user || !(await bcrypt.compare(String(req.body?.password ?? ''), user.passwordHash))) throw new HttpError(401, 'Correo o contraseña incorrectos');
      startSession(res, user);
      res.json({ user: publicUser(user) });
    }),
  );

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.post(
    '/api/auth/forgot',
    h(async (req, res) => {
      const user = await store.userByEmail(String(req.body?.email ?? '').trim().toLowerCase());
      if (user) {
        const token = randomBytes(24).toString('base64url');
        await store.saveResetToken(user.id, sha256(token), new Date(Date.now() + 3600_000));
        await mailer.send(
          user.email,
          'Restablecer la contraseña de GML EasySoftechnic',
          `Hola${user.name ? ` ${user.name}` : ''}:\n\nPara elegir una contraseña nueva abre este enlace (vale 1 hora):\n${cfg.publicUrl}/#restablecer=${token}\n\nSi no lo has pedido tú, ignora este correo.`,
        );
      }
      // Misma respuesta exista o no la cuenta, para no revelar qué correos están registrados.
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/auth/reset',
    h(async (req, res) => {
      const password = String(req.body?.password ?? '');
      if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
      const uid = await store.takeResetToken(sha256(String(req.body?.token ?? '')));
      if (!uid) throw new HttpError(400, 'El enlace no es válido o ha caducado; pide otro');
      await store.setPassword(uid, await bcrypt.hash(password, 10));
      const user = (await store.userById(uid))!;
      startSession(res, user);
      res.json({ user: publicUser(user) });
    }),
  );

  // A partir de aquí, rutas que necesitan sesión.
  const api = express.Router();
  api.use(async (req, _res, next) => {
    try {
      const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
      const token = (req.cookies?.[COOKIE] as string | undefined) ?? bearer;
      if (!token) throw new HttpError(401, 'Inicia sesión');
      let uid: number;
      try {
        uid = (jwt.verify(token, cfg.jwtSecret) as { uid: number }).uid;
      } catch {
        throw new HttpError(401, 'La sesión ha caducado; vuelve a entrar');
      }
      const user = await store.userById(uid);
      if (!user) throw new HttpError(401, 'Inicia sesión');
      (req as AuthedRequest).user = user;
      next();
    } catch (e) {
      next(e);
    }
  });

  api.get(
    '/me',
    h(async (req, res) => {
      const u = (req as AuthedRequest).user;
      const licenses = await store.licensesByUser(u.id);
      res.json({
        user: publicUser(u),
        admin: isAdmin(u),
        licenses: await Promise.all(
          licenses.map(async (l) => ({ ...publicLicense(l), activations: (await store.activations(l.id)).map((a) => ({ machineId: a.machineId, machineName: a.machineName, lastSeen: a.lastSeen.toISOString() })) })),
        ),
      });
    }),
  );

  // ---------- créditos ----------
  api.post(
    '/credits/spend',
    h(async (req, res) => {
      const u = (req as AuthedRequest).user;
      const action = String(req.body?.action ?? '');
      if (!(action in CREDIT_COST)) throw new HttpError(400, 'Actuación desconocida');
      const cost = CREDIT_COST[action as CreditAction];
      if (cost === 0) return res.json({ balance: u.credits });
      const balance = await store.spendCredits(u.id, cost, CREDIT_ACTION_LABELS[action as CreditAction]);
      if (balance === undefined) throw new HttpError(402, 'Créditos insuficientes');
      res.json({ balance });
    }),
  );

  api.get(
    '/credits/history',
    h(async (req, res) => {
      const u = (req as AuthedRequest).user;
      res.json({ entries: (await store.ledger(u.id, 100)).map((e) => ({ amount: e.amount, reason: e.reason, at: e.createdAt.toISOString() })) });
    }),
  );

  // ---------- compra ----------
  api.post(
    '/checkout',
    h(async (req, res) => {
      if (!payments) throw new HttpError(503, 'Los pagos todavía no están activados');
      const u = (req as AuthedRequest).user;
      const back = `${cfg.publicUrl}/#cuenta`;
      if (req.body?.kind === 'bundle') {
        const b = CREDIT_BUNDLES.find((x) => x.id === req.body?.id);
        if (!b) throw new HttpError(400, 'Bono desconocido');
        const url = await payments.createCheckout({
          item: { name: b.name, amount: b.price },
          email: u.email,
          metadata: { userId: String(u.id), kind: 'bundle', bundleId: b.id },
          successUrl: `${back}-pagado`,
          cancelUrl: back,
        });
        return res.json({ url });
      }
      if (req.body?.kind === 'license') {
        const { modules, plan } = parseLicenseOrder(req.body);
        const url = await payments.createCheckout({
          item: { name: licenseName(modules, plan), amount: licensePrice(modules, plan) },
          email: u.email,
          metadata: { userId: String(u.id), kind: 'license', modules: modules.join(','), plan },
          successUrl: `${back}-pagado`,
          cancelUrl: back,
        });
        return res.json({ url });
      }
      throw new HttpError(400, 'Compra no válida');
    }),
  );

  /** Entrega lo comprado. Se llama desde el aviso de Stripe; es idempotente. */
  async function fulfil(sessionId: string, amount: number, meta: Record<string, string>) {
    const userId = Number(meta.userId);
    const user = await store.userById(userId);
    if (!user) return;
    if (meta.kind === 'bundle') {
      const b = CREDIT_BUNDLES.find((x) => x.id === meta.bundleId);
      if (!b || !(await store.claimPayment(sessionId, userId, amount, b.name))) return;
      const balance = await store.addCredits(userId, b.credits, `Compra: ${b.name}`);
      await mailer.send(user.email, 'Compra de créditos confirmada', `Se han añadido ${b.credits} créditos a tu cuenta. Saldo actual: ${balance} créditos.\n\n${cfg.publicUrl}`).catch(() => undefined);
    } else if (meta.kind === 'license') {
      const { modules, plan } = parseLicenseOrder({ modules: (meta.modules ?? '').split(','), plan: meta.plan });
      if (!(await store.claimPayment(sessionId, userId, amount, licenseName(modules, plan)))) return;
      const lic = await issueLicense(userId, modules, plan);
      await mailer.send(user.email, 'Tu licencia de GML EasySoftechnic', licenseEmail(lic)).catch(() => undefined);
    }
  }

  async function issueLicense(userId: number, modules: DesktopModule[], plan: LicensePlan) {
    return store.createLicense({ key: newLicenseKey(), userId, modules, plan, expiresAt: licenseExpiry(plan) });
  }

  function licenseEmail(l: License) {
    return [
      'Gracias por tu compra.',
      '',
      `Clave de licencia: ${l.key}`,
      `Módulos: ${l.modules.map((m) => DESKTOP_MODULES[m]).join(', ')}`,
      `Validez: ${l.expiresAt ? `hasta el ${l.expiresAt.toLocaleDateString('es-ES')}` : 'de por vida'}`,
      '',
      `Introduce la clave en la aplicación de escritorio (Ayuda > Activar licencia). Puedes usarla en ${MAX_ACTIVATIONS} equipos a la vez.`,
      `También la tienes en ${cfg.publicUrl}/#cuenta`,
    ].join('\n');
  }

  // ---------- licencias de escritorio ----------
  // La aplicación de escritorio se identifica con la clave de licencia, sin sesión web.
  app.post(
    '/api/licenses/activate',
    h(async (req, res) => {
      const { lic, machineId } = await checkLicense(req.body);
      const machineName = String(req.body?.machineName ?? '').slice(0, 190);
      const acts = await store.activations(lic.id);
      if (!acts.some((a) => a.machineId === machineId) && acts.length >= MAX_ACTIVATIONS) {
        throw new HttpError(409, `La licencia ya está activada en ${MAX_ACTIVATIONS} equipos (${acts.map((a) => a.machineName || a.machineId).join(', ')}). Desactívala en uno de ellos o desde tu cuenta en la web.`);
      }
      await store.upsertActivation(lic.id, machineId, machineName);
      res.json({ token: await token(lic, machineId) });
    }),
  );

  /** La aplicación lo llama al arrancar con conexión para renovar el plazo sin conexión. */
  app.post(
    '/api/licenses/refresh',
    h(async (req, res) => {
      const { lic, machineId } = await checkLicense(req.body);
      const acts = await store.activations(lic.id);
      if (!acts.some((a) => a.machineId === machineId)) throw new HttpError(403, 'Este equipo ya no está activado; vuelve a activar la licencia');
      await store.upsertActivation(lic.id, machineId, acts.find((a) => a.machineId === machineId)!.machineName);
      res.json({ token: await token(lic, machineId) });
    }),
  );

  app.post(
    '/api/licenses/deactivate',
    h(async (req, res) => {
      const key = String(req.body?.key ?? '').trim().toUpperCase();
      const lic = await store.licenseByKey(key);
      if (!lic) throw new HttpError(404, 'Clave de licencia no encontrada');
      await store.removeActivation(lic.id, String(req.body?.machineId ?? ''));
      res.json({ ok: true });
    }),
  );

  /** Desde la web, el dueño puede liberar un equipo (por ejemplo si se le estropeó el ordenador). */
  api.post(
    '/licenses/release',
    h(async (req, res) => {
      const u = (req as AuthedRequest).user;
      const lic = await store.licenseByKey(String(req.body?.key ?? ''));
      if (!lic || lic.userId !== u.id) throw new HttpError(404, 'Licencia no encontrada');
      await store.removeActivation(lic.id, String(req.body?.machineId ?? ''));
      res.json({ ok: true });
    }),
  );

  async function checkLicense(body: Record<string, unknown> | undefined) {
    const key = String(body?.key ?? '').trim().toUpperCase();
    const machineId = String(body?.machineId ?? '').trim();
    if (!machineId || machineId.length > 100) throw new HttpError(400, 'Identificador de equipo no válido');
    const lic = await store.licenseByKey(key);
    if (!lic) throw new HttpError(404, 'Clave de licencia no encontrada');
    if (lic.revoked) throw new HttpError(403, 'Esta licencia está anulada');
    if (lic.expiresAt && lic.expiresAt < new Date()) throw new HttpError(403, `La licencia caducó el ${lic.expiresAt.toLocaleDateString('es-ES')}; renuévala en la web`);
    return { lic, machineId };
  }

  async function token(lic: License, machineId: string) {
    if (!cfg.licensePrivateKey) throw new HttpError(503, 'Falta la clave de firma de licencias en el servidor');
    const user = await store.userById(lic.userId);
    const now = new Date();
    return signLicenseToken(
      {
        key: lic.key,
        modules: lic.modules,
        plan: lic.plan,
        expiresAt: lic.expiresAt?.toISOString() ?? null,
        machineId,
        issuedAt: now.toISOString(),
        offlineUntil: offlineUntil(now, lic.expiresAt).toISOString(),
        email: user?.email ?? '',
      },
      cfg.licensePrivateKey,
    );
  }

  // ---------- Catastro ----------
  // El navegador no puede llamar directamente a los servicios del Catastro (no permiten CORS):
  // el servidor hace de intermediario, solo hacia direcciones fijas y con caché de 10 minutos.
  const cache = new Map<string, { at: number; text: string }>();
  const hits = new Map<number, { minute: number; n: number }>();
  api.get(
    '/catastro',
    h(async (req, res) => {
      const u = (req as AuthedRequest).user;
      const minute = Math.floor(Date.now() / 60000);
      const c = hits.get(u.id);
      if (c && c.minute === minute && c.n >= 60) throw new HttpError(429, 'Demasiadas consultas al Catastro; espera un minuto');
      hits.set(u.id, c && c.minute === minute ? { minute, n: c.n + 1 } : { minute, n: 1 });
      const q = req.query as Record<string, string>;
      let url: string;
      try {
        const kind = q.kind as CatastroQuery['kind'];
        url = catastroUrl(
          kind === 'punto'
            ? { kind, x: Number(q.x), y: Number(q.y), epsg: Number(q.epsg) }
            : kind === 'datos'
              ? { kind, refcat: String(q.refcat ?? '') }
              : kind === 'parcela' || kind === 'colindantes'
                ? { kind, refcat: String(q.refcat ?? ''), epsg: Number(q.epsg) }
                : (() => { throw new Error('Consulta desconocida'); })(),
        );
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
      const hit = cache.get(url);
      let text: string;
      if (hit && Date.now() - hit.at < 600_000) text = hit.text;
      else {
        try {
          text = await fetchText(url);
        } catch (e) {
          throw e instanceof HttpError ? e : new HttpError(502, 'No se ha podido conectar con el Catastro; inténtalo de nuevo');
        }
        if (cache.size > 500) cache.clear();
        cache.set(url, { at: Date.now(), text });
      }
      res.type('application/xml').send(text);
    }),
  );

  // ---------- administración (correos en ADMIN_EMAILS) ----------
  const adminOnly = (req: Request, _res: Response, next: NextFunction) =>
    isAdmin((req as AuthedRequest).user) ? next() : next(new HttpError(403, 'Solo para administración'));

  api.post(
    '/admin/credits',
    adminOnly,
    h(async (req, res) => {
      const target = await store.userByEmail(String(req.body?.email ?? '').trim().toLowerCase());
      const amount = Math.trunc(Number(req.body?.amount));
      if (!target) throw new HttpError(404, 'No hay ninguna cuenta con ese correo');
      if (!amount || amount < 1 || amount > 10000) throw new HttpError(400, 'Cantidad no válida');
      res.json({ balance: await store.addCredits(target.id, amount, String(req.body?.reason ?? 'Regalo de administración').slice(0, 200)) });
    }),
  );

  api.post(
    '/admin/license',
    adminOnly,
    h(async (req, res) => {
      const target = await store.userByEmail(String(req.body?.email ?? '').trim().toLowerCase());
      if (!target) throw new HttpError(404, 'No hay ninguna cuenta con ese correo');
      const { modules, plan } = parseLicenseOrder(req.body);
      const lic = await issueLicense(target.id, modules, plan);
      if (req.body?.notify) await mailer.send(target.email, 'Tu licencia de GML EasySoftechnic', licenseEmail(lic)).catch(() => undefined);
      res.json({ license: publicLicense(lic) });
    }),
  );

  app.use('/api', api);

  // ---------- web ----------
  if (cfg.webDist && existsSync(cfg.webDist)) {
    const dist = path.resolve(cfg.webDist);
    app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'No encontrado')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

function parseLicenseOrder(body: { modules?: unknown; plan?: unknown }): { modules: DesktopModule[]; plan: LicensePlan } {
  const raw = Array.isArray(body.modules) ? body.modules.map(String) : [];
  const modules = [...new Set(raw)].filter(isDesktopModule);
  const plan = String(body.plan ?? '');
  if (!modules.length || modules.length !== new Set(raw).size) throw new HttpError(400, 'Elige al menos un módulo válido');
  if (!isLicensePlan(plan)) throw new HttpError(400, 'Plan de licencia no válido');
  return { modules, plan };
}

function licenseName(modules: DesktopModule[], plan: LicensePlan) {
  const all = modules.length === Object.keys(DESKTOP_MODULES).length;
  return `Licencia ${LICENSE_PLANS[plan].name.toLowerCase()}: ${all ? 'todos los módulos' : modules.map((m) => DESKTOP_MODULES[m]).join(', ')}`;
}
