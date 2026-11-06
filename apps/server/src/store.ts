import type { DesktopModule, LicensePlan } from '@gml/core/commerce';

export interface User {
  id: number;
  email: string;
  name: string;
  passwordHash: string;
  credits: number;
  createdAt: Date;
}

export interface LedgerEntry {
  id: number;
  userId: number;
  /** Positivo = compra o regalo, negativo = gasto. */
  amount: number;
  reason: string;
  createdAt: Date;
}

export interface License {
  id: number;
  key: string;
  userId: number;
  modules: DesktopModule[];
  plan: LicensePlan;
  expiresAt: Date | null;
  createdAt: Date;
  revoked: boolean;
}

export interface Activation {
  licenseId: number;
  machineId: string;
  machineName: string;
  activatedAt: Date;
  lastSeen: Date;
}

/**
 * Almacenamiento. Hay dos implementaciones: MySQL (producción, Hostinger) y memoria
 * (pruebas y desarrollo sin base de datos).
 */
export interface Store {
  createUser(u: { email: string; name: string; passwordHash: string; credits: number }): Promise<User>;
  userByEmail(email: string): Promise<User | undefined>;
  userById(id: number): Promise<User | undefined>;
  setPassword(userId: number, passwordHash: string): Promise<void>;

  saveResetToken(userId: number, tokenHash: string, expires: Date): Promise<void>;
  /** Devuelve el usuario si el token existe y no ha caducado, y lo borra. */
  takeResetToken(tokenHash: string): Promise<number | undefined>;

  /** Suma créditos (amount > 0). */
  addCredits(userId: number, amount: number, reason: string): Promise<number>;
  /** Resta créditos si hay saldo suficiente; devuelve el saldo nuevo o undefined si no llega. */
  spendCredits(userId: number, amount: number, reason: string): Promise<number | undefined>;
  ledger(userId: number, limit: number): Promise<LedgerEntry[]>;

  /** Marca un pago de Stripe como procesado. Devuelve false si ya lo estaba (webhook repetido). */
  claimPayment(stripeSessionId: string, userId: number, amountCents: number, description: string): Promise<boolean>;

  createLicense(l: Omit<License, 'id' | 'createdAt' | 'revoked'>): Promise<License>;
  licensesByUser(userId: number): Promise<License[]>;
  licenseByKey(key: string): Promise<License | undefined>;
  activations(licenseId: number): Promise<Activation[]>;
  upsertActivation(licenseId: number, machineId: string, machineName: string): Promise<void>;
  removeActivation(licenseId: number, machineId: string): Promise<boolean>;
}
