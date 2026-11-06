import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { LICENSE_PLANS, OFFLINE_DAYS, type LicensePlan, type LicenseTokenPayload } from '@gml/core/commerce';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0 ni I/1 para que no se confundan al teclear

/** Clave de licencia del tipo GML-7KQ2-M9XA-T4PR-H8ZD. */
export function newLicenseKey(): string {
  const bytes = randomBytes(16);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `GML-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

export function licenseExpiry(plan: LicensePlan, from = new Date()): Date | null {
  const months = LICENSE_PLANS[plan].months;
  if (months === null) return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

const b64url = (b: Buffer) => b.toString('base64url');

/**
 * Certificado de licencia firmado con Ed25519. La aplicación de escritorio lleva la
 * clave pública y lo comprueba sin conexión; no se puede falsificar sin la clave privada,
 * que solo está en el servidor.
 */
export function signLicenseToken(payload: LicenseTokenPayload, privateKeyPem: string): string {
  const body = Buffer.from(JSON.stringify(payload));
  const sig = sign(null, body, createPrivateKey(privateKeyPem));
  return `${b64url(body)}.${b64url(sig)}`;
}

export function verifyLicenseToken(token: string, publicKeyPem: string): LicenseTokenPayload | undefined {
  const [body, sig] = token.split('.');
  if (!body || !sig) return undefined;
  const ok = verify(null, Buffer.from(body, 'base64url'), createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url'));
  return ok ? (JSON.parse(Buffer.from(body, 'base64url').toString()) as LicenseTokenPayload) : undefined;
}

export function offlineUntil(now: Date, expiresAt: Date | null): Date {
  const d = new Date(now.getTime() + OFFLINE_DAYS * 86400_000);
  return expiresAt && expiresAt < d ? expiresAt : d;
}

export function generateLicenseKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
