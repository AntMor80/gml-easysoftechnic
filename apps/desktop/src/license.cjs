// Comprobación de la licencia en el equipo. El certificado lo firma el servidor con su
// clave privada; aquí solo está la pública, así que no se puede falsificar.
const crypto = require('node:crypto');
const os = require('node:os');

/** Identificador estable del equipo (no contiene datos personales: es un resumen). */
function machineId() {
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
    .map((i) => i.mac)
    .sort();
  const raw = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model ?? '', macs[0] ?? ''].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function verifyToken(token, publicKeyPem) {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return undefined;
  try {
    const ok = crypto.verify(null, Buffer.from(body, 'base64url'), crypto.createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url'));
    return ok ? JSON.parse(Buffer.from(body, 'base64url').toString()) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Estado de la licencia guardada.
 * status: 'none' | 'ok' | 'invalid' | 'other-machine' | 'expired' | 'offline-expired'
 */
function evaluate(saved, publicKeyPem, mid, now = new Date()) {
  if (!saved?.token) return { status: 'none', modules: [] };
  const p = verifyToken(saved.token, publicKeyPem);
  if (!p) return { status: 'invalid', modules: [] };
  if (p.machineId !== mid) return { status: 'other-machine', modules: [], payload: p };
  if (p.expiresAt && new Date(p.expiresAt) < now) return { status: 'expired', modules: [], payload: p };
  if (new Date(p.offlineUntil) < now) return { status: 'offline-expired', modules: [], payload: p };
  return { status: 'ok', modules: p.modules, payload: p };
}

module.exports = { machineId, verifyToken, evaluate };
