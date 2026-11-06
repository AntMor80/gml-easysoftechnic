import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MemoryStore } from '../src/memoryStore.js';
import { MysqlStore } from '../src/mysqlStore.js';
import type { Store } from '../src/store.js';
import mysql from 'mysql2/promise';
import { generateLicenseKeyPair, verifyLicenseToken } from '../src/licenses.js';
import type { Payments, PaidSession } from '../src/payments.js';
import type { Config } from '../src/config.js';
import { licensePrice } from '@gml/core/commerce';

const keys = generateLicenseKeyPair();
const cfg: Config = {
  port: 0,
  publicUrl: 'https://app.ejemplo.es',
  jwtSecret: 'secreto-de-prueba',
  licensePrivateKey: keys.privateKey,
  adminEmails: ['admin@ejemplo.es'],
  welcomeCredits: 3,
};

/** Pasarela falsa: guarda las compras y simula el aviso de Stripe. */
function fakePayments() {
  const pending: PaidSession[] = [];
  let next: PaidSession | undefined;
  const p: Payments = {
    async createCheckout({ item, metadata }) {
      pending.push({ id: `cs_${pending.length + 1}`, amount: item.amount, metadata });
      return `https://checkout.stripe.test/${pending.length}`;
    },
    parseWebhook(_raw, sig) {
      if (sig !== 'firma-ok') throw new Error('firma');
      return next;
    },
  };
  return { p, pending, setNext: (s: PaidSession) => (next = s) };
}

let store: Store;
let pay: ReturnType<typeof fakePayments>;
let mails: { to: string; subject: string; text: string }[];
let app: ReturnType<typeof createApp>;

// Con TEST_DB=mysql://usuario:clave@host/base las mismas pruebas se ejecutan contra MySQL.
const pool = process.env.TEST_DB ? mysql.createPool({ uri: process.env.TEST_DB, timezone: 'Z' }) : undefined;

beforeEach(async () => {
  if (pool) {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['activations', 'licenses', 'payments', 'credit_ledger', 'password_resets', 'users']) await pool.query(`TRUNCATE ${t}`);
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    store = new MysqlStore(pool);
  } else store = new MemoryStore();
  pay = fakePayments();
  mails = [];
  app = createApp({ cfg, store, payments: pay.p, mailer: { send: async (to, subject, text) => void mails.push({ to, subject, text }) } });
});

async function register(email = 'ana@ejemplo.es') {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ email, password: 'contraseña1', name: 'Ana' });
  expect(r.status).toBe(201);
  return agent;
}

async function webhook(s: PaidSession) {
  pay.setNext(s);
  return request(app).post('/api/stripe/webhook').set('stripe-signature', 'firma-ok').set('Content-Type', 'application/json').send('{}');
}

describe('cuentas', () => {
  it('registra, entra y sale', async () => {
    const a = await register();
    expect((await a.get('/api/me')).body.user).toMatchObject({ email: 'ana@ejemplo.es', credits: 3 });
    await a.post('/api/auth/logout');
    expect((await a.get('/api/me')).status).toBe(401);
    const bad = await request(app).post('/api/auth/login').send({ email: 'ana@ejemplo.es', password: 'mala' });
    expect(bad.status).toBe(401);
    const ok = await request.agent(app).post('/api/auth/login').send({ email: 'ANA@ejemplo.es', password: 'contraseña1' });
    expect(ok.status).toBe(200);
  });

  it('rechaza correos repetidos y contraseñas cortas', async () => {
    await register();
    expect((await request(app).post('/api/auth/register').send({ email: 'ana@ejemplo.es', password: 'contraseña1' })).status).toBe(409);
    expect((await request(app).post('/api/auth/register').send({ email: 'b@ejemplo.es', password: 'corta' })).status).toBe(400);
  });

  it('restablece la contraseña con el enlace del correo', async () => {
    await register();
    await request(app).post('/api/auth/forgot').send({ email: 'ana@ejemplo.es' });
    const token = /restablecer=([\w-]+)/.exec(mails[0]!.text)![1];
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'nueva-clave-1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'otra-clave-1' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: 'ana@ejemplo.es', password: 'nueva-clave-1' })).status).toBe(200);
  });
});

describe('créditos', () => {
  it('cobra cada actuación y se para sin saldo', async () => {
    const a = await register();
    expect((await a.post('/api/credits/spend').send({ action: 'paqueteDxf' })).body.balance).toBe(1);
    expect((await a.post('/api/credits/spend').send({ action: 'exportacion' })).body.balance).toBe(1);
    expect((await a.post('/api/credits/spend').send({ action: 'informe' })).body.balance).toBe(0);
    expect((await a.post('/api/credits/spend').send({ action: 'informe' })).status).toBe(402);
    expect((await a.get('/api/credits/history')).body.entries).toHaveLength(3);
  });

  it('suma el bono al confirmarse el pago, una sola vez', async () => {
    const a = await register();
    const r = await a.post('/api/checkout').send({ kind: 'bundle', id: 'b30' });
    expect(r.body.url).toContain('checkout.stripe.test');
    const s = pay.pending[0]!;
    expect(s.amount).toBe(3900);
    await webhook(s);
    await webhook(s); // Stripe puede repetir el aviso
    expect((await a.get('/api/me')).body.user.credits).toBe(33);
    expect(mails.some((m) => m.subject.includes('créditos'))).toBe(true);
  });

  it('rechaza avisos sin firma válida', async () => {
    const r = await request(app).post('/api/stripe/webhook').set('stripe-signature', 'falsa').set('Content-Type', 'application/json').send('{}');
    expect(r.status).toBe(400);
  });
});

describe('licencias de escritorio', () => {
  async function buyLicense(modules: string[], plan: string) {
    const a = await register();
    await a.post('/api/checkout').send({ kind: 'license', modules, plan });
    await webhook(pay.pending[0]!);
    const me = (await a.get('/api/me')).body;
    return { a, key: me.licenses[0].key as string, me };
  }

  it('calcula precios con descuento por volumen', () => {
    expect(licensePrice(['gmlParcela'], 'anual')).toBe(5900);
    expect(licensePrice(['gmlParcela', 'gmlEdificio'], 'anual')).toBe(10600);
    expect(licensePrice(['gmlParcela', 'gmlEdificio', 'operaciones', 'geometria', 'exportacion', 'informes', 'qgis'], 'vitalicia')).toBe(83600);
  });

  it('emite la licencia comprada y la activa en 2 equipos como máximo', async () => {
    const { a, key, me } = await buyLicense(['gmlParcela', 'informes'], 'bianual');
    expect(key).toMatch(/^GML-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const years = (new Date(me.licenses[0].expiresAt).getTime() - Date.now()) / (365.25 * 86400_000);
    expect(years).toBeGreaterThan(1.9);
    expect(mails.some((m) => m.text.includes(key))).toBe(true);

    const act = (machineId: string) => request(app).post('/api/licenses/activate').send({ key, machineId, machineName: machineId });
    const t1 = await act('PC-1');
    expect(t1.status).toBe(200);
    const payload = verifyLicenseToken(t1.body.token, keys.publicKey)!;
    expect(payload).toMatchObject({ key, plan: 'bianual', machineId: 'PC-1', modules: ['gmlParcela', 'informes'] });
    expect(new Date(payload.offlineUntil).getTime() - Date.now()).toBeGreaterThan(29 * 86400_000);

    expect((await act('PC-2')).status).toBe(200);
    expect((await act('PC-1')).status).toBe(200); // reactivar el mismo equipo no cuenta
    expect((await act('PC-3')).status).toBe(409);

    // el dueño libera un equipo desde la web
    expect((await a.post('/api/licenses/release').send({ key, machineId: 'PC-2' })).status).toBe(200);
    expect((await act('PC-3')).status).toBe(200);
    expect((await request(app).post('/api/licenses/refresh').send({ key, machineId: 'PC-2' })).status).toBe(403);
  });

  it('una licencia de por vida no caduca y un certificado manipulado no vale', async () => {
    const { key, me } = await buyLicense(['qgis'], 'vitalicia');
    expect(me.licenses[0].expiresAt).toBeNull();
    const { token } = (await request(app).post('/api/licenses/activate').send({ key, machineId: 'PC-1' })).body;
    const [body, sig] = token.split('.');
    const forged = JSON.parse(Buffer.from(body, 'base64url').toString());
    forged.modules = ['gmlParcela', 'gmlEdificio', 'qgis'];
    expect(verifyLicenseToken(`${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`, keys.publicKey)).toBeUndefined();
  });

  it('rechaza claves inexistentes y licencias caducadas', async () => {
    expect((await request(app).post('/api/licenses/activate').send({ key: 'GML-AAAA-AAAA-AAAA-AAAA', machineId: 'X' })).status).toBe(404);
    const u = await store.createUser({ email: 'c@e.es', name: '', passwordHash: 'x', credits: 0 });
    await store.createLicense({ key: 'GML-OLD1-OLD1-OLD1-OLD1', userId: u.id, modules: ['qgis'], plan: 'anual', expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).post('/api/licenses/activate').send({ key: 'GML-OLD1-OLD1-OLD1-OLD1', machineId: 'X' })).status).toBe(403);
  });
});

describe('administración', () => {
  it('solo el administrador regala créditos y licencias', async () => {
    const ana = await register();
    expect((await ana.post('/api/admin/credits').send({ email: 'ana@ejemplo.es', amount: 50 })).status).toBe(403);
    const admin = await register('admin@ejemplo.es');
    expect((await admin.post('/api/admin/credits').send({ email: 'ana@ejemplo.es', amount: 50 })).body.balance).toBe(53);
    const r = await admin.post('/api/admin/license').send({ email: 'ana@ejemplo.es', modules: ['gmlParcela'], plan: 'anual' });
    expect(r.body.license.key).toMatch(/^GML-/);
  });
});
