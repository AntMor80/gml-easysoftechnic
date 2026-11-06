const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { evaluate, machineId } = require('../src/license.cjs');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const sign = (p) => {
  const body = Buffer.from(JSON.stringify(p));
  return `${body.toString('base64url')}.${crypto.sign(null, body, privateKey).toString('base64url')}`;
};
const day = 86400000;
const base = { key: 'GML-AAAA', modules: ['gmlParcela'], plan: 'anual', machineId: machineId(), email: 'a@b.es', issuedAt: new Date().toISOString() };

test('licencia válida en este equipo', () => {
  const t = sign({ ...base, expiresAt: new Date(Date.now() + 300 * day).toISOString(), offlineUntil: new Date(Date.now() + 30 * day).toISOString() });
  const r = evaluate({ key: 'GML-AAAA', token: t }, pub, machineId());
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.modules, ['gmlParcela']);
});

test('rechaza otro equipo, caducidad, plazo sin conexión y manipulación', () => {
  const ok = { ...base, expiresAt: null, offlineUntil: new Date(Date.now() + 30 * day).toISOString() };
  assert.equal(evaluate({ token: sign(ok) }, pub, 'otro-equipo').status, 'other-machine');
  assert.equal(evaluate({ token: sign({ ...ok, expiresAt: new Date(Date.now() - day).toISOString() }) }, pub, machineId()).status, 'expired');
  assert.equal(evaluate({ token: sign({ ...ok, offlineUntil: new Date(Date.now() - day).toISOString() }) }, pub, machineId()).status, 'offline-expired');
  const [, sig] = sign(ok).split('.');
  const forged = Buffer.from(JSON.stringify({ ...ok, modules: ['gmlParcela', 'qgis'] })).toString('base64url');
  assert.equal(evaluate({ token: `${forged}.${sig}` }, pub, machineId()).status, 'invalid');
  assert.equal(evaluate(undefined, pub, machineId()).status, 'none');
});
