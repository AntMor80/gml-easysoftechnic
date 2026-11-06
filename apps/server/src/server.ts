import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createMailer } from './mailer.js';
import { MemoryStore } from './memoryStore.js';
import { MysqlStore } from './mysqlStore.js';
import { stripePayments } from './payments.js';

// Lee un archivo .env junto al servidor si existe (Hostinger también permite poner las variables en el panel).
const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of [path.join(here, '..', '.env'), path.join(process.cwd(), '.env')]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  break;
}

const cfg = loadConfig();
cfg.webDist ??= path.join(here, '..', '..', 'web', 'dist');

const store = cfg.db ? MysqlStore.connect(cfg.db) : new MemoryStore();
if (!cfg.db) console.warn('Sin DB_HOST: los datos se guardan en memoria y se pierden al reiniciar (solo para pruebas).');

const payments = cfg.stripeSecretKey && cfg.stripeWebhookSecret ? stripePayments(cfg.stripeSecretKey, cfg.stripeWebhookSecret) : undefined;
if (!payments) console.warn('Sin STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET: la compra está desactivada.');

createApp({ cfg, store, mailer: createMailer(cfg), payments }).listen(cfg.port, () => {
  console.log(`GML EasySoftechnic escuchando en el puerto ${cfg.port} (${cfg.publicUrl})`);
});
