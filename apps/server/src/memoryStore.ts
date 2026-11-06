import type { Activation, LedgerEntry, License, Store, User } from './store.js';

/** Almacenamiento en memoria: para pruebas y para probar el servidor sin MySQL. */
export class MemoryStore implements Store {
  private users: User[] = [];
  private resets = new Map<string, { userId: number; expires: Date }>();
  private entries: LedgerEntry[] = [];
  private payments = new Set<string>();
  private licenses: License[] = [];
  private acts: Activation[] = [];

  async createUser(u: { email: string; name: string; passwordHash: string; credits: number }) {
    if (this.users.some((x) => x.email === u.email)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    const user: User = { ...u, id: this.users.length + 1, createdAt: new Date() };
    this.users.push(user);
    if (u.credits) this.entries.push({ id: this.entries.length + 1, userId: user.id, amount: u.credits, reason: 'Créditos de bienvenida', createdAt: new Date() });
    return { ...user };
  }
  async userByEmail(email: string) {
    const u = this.users.find((x) => x.email === email);
    return u && { ...u };
  }
  async userById(id: number) {
    const u = this.users.find((x) => x.id === id);
    return u && { ...u };
  }
  async setPassword(userId: number, passwordHash: string) {
    const u = this.users.find((x) => x.id === userId);
    if (u) u.passwordHash = passwordHash;
  }
  async saveResetToken(userId: number, tokenHash: string, expires: Date) {
    this.resets.set(tokenHash, { userId, expires });
  }
  async takeResetToken(tokenHash: string) {
    const r = this.resets.get(tokenHash);
    this.resets.delete(tokenHash);
    return r && r.expires > new Date() ? r.userId : undefined;
  }
  async addCredits(userId: number, amount: number, reason: string) {
    const u = this.users.find((x) => x.id === userId)!;
    u.credits += amount;
    this.entries.push({ id: this.entries.length + 1, userId, amount, reason, createdAt: new Date() });
    return u.credits;
  }
  async spendCredits(userId: number, amount: number, reason: string) {
    const u = this.users.find((x) => x.id === userId);
    if (!u || u.credits < amount) return undefined;
    u.credits -= amount;
    this.entries.push({ id: this.entries.length + 1, userId, amount: -amount, reason, createdAt: new Date() });
    return u.credits;
  }
  async ledger(userId: number, limit: number) {
    return this.entries.filter((e) => e.userId === userId).reverse().slice(0, limit);
  }
  async claimPayment(id: string) {
    if (this.payments.has(id)) return false;
    this.payments.add(id);
    return true;
  }
  async createLicense(l: Omit<License, 'id' | 'createdAt' | 'revoked'>) {
    const lic: License = { ...l, id: this.licenses.length + 1, createdAt: new Date(), revoked: false };
    this.licenses.push(lic);
    return { ...lic };
  }
  async licensesByUser(userId: number) {
    return this.licenses.filter((l) => l.userId === userId).map((l) => ({ ...l }));
  }
  async licenseByKey(key: string) {
    const l = this.licenses.find((x) => x.key === key);
    return l && { ...l };
  }
  async activations(licenseId: number) {
    return this.acts.filter((a) => a.licenseId === licenseId).map((a) => ({ ...a }));
  }
  async upsertActivation(licenseId: number, machineId: string, machineName: string) {
    const a = this.acts.find((x) => x.licenseId === licenseId && x.machineId === machineId);
    if (a) {
      a.lastSeen = new Date();
      a.machineName = machineName;
    } else this.acts.push({ licenseId, machineId, machineName, activatedAt: new Date(), lastSeen: new Date() });
  }
  async removeActivation(licenseId: number, machineId: string) {
    const n = this.acts.length;
    this.acts = this.acts.filter((a) => !(a.licenseId === licenseId && a.machineId === machineId));
    return this.acts.length < n;
  }
}
