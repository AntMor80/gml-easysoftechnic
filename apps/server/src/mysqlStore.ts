import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import type { DesktopModule, LicensePlan } from '@gml/core/commerce';
import type { Activation, LedgerEntry, License, Store, User } from './store.js';

type Row = RowDataPacket & Record<string, unknown>;

const toUser = (r: Row): User => ({
  id: Number(r.id),
  email: String(r.email),
  name: String(r.name),
  passwordHash: String(r.password_hash),
  credits: Number(r.credits),
  createdAt: new Date(r.created_at as string),
});

const toLicense = (r: Row): License => ({
  id: Number(r.id),
  key: String(r.license_key),
  userId: Number(r.user_id),
  modules: String(r.modules).split(',').filter(Boolean) as DesktopModule[],
  plan: String(r.plan) as LicensePlan,
  expiresAt: r.expires_at ? new Date(r.expires_at as string) : null,
  createdAt: new Date(r.created_at as string),
  revoked: Boolean(r.revoked),
});

/** Almacenamiento en MySQL (base de datos del plan Business de Hostinger). */
export class MysqlStore implements Store {
  constructor(private pool: Pool) {}

  static connect(db: { host: string; port: number; user: string; password: string; database: string }) {
    return new MysqlStore(mysql.createPool({ ...db, connectionLimit: 5, timezone: 'Z', charset: 'utf8mb4' }));
  }

  async createUser(u: { email: string; name: string; passwordHash: string; credits: number }) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.execute<ResultSetHeader>('INSERT INTO users (email, name, password_hash, credits) VALUES (?, ?, ?, ?)', [u.email, u.name, u.passwordHash, u.credits]);
      if (u.credits) await conn.execute('INSERT INTO credit_ledger (user_id, amount, reason) VALUES (?, ?, ?)', [res.insertId, u.credits, 'Créditos de bienvenida']);
      await conn.commit();
      return (await this.userById(res.insertId))!;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  async userByEmail(email: string) {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] && toUser(rows[0]);
  }
  async userById(id: number) {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] && toUser(rows[0]);
  }
  async setPassword(userId: number, passwordHash: string) {
    await this.pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
  }
  async saveResetToken(userId: number, tokenHash: string, expires: Date) {
    await this.pool.execute('DELETE FROM password_resets WHERE user_id = ?', [userId]);
    await this.pool.execute('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [tokenHash, userId, expires]);
  }
  async takeResetToken(tokenHash: string) {
    const [rows] = await this.pool.execute<Row[]>('SELECT user_id, expires_at FROM password_resets WHERE token_hash = ?', [tokenHash]);
    await this.pool.execute('DELETE FROM password_resets WHERE token_hash = ?', [tokenHash]);
    const r = rows[0];
    return r && new Date(r.expires_at as string) > new Date() ? Number(r.user_id) : undefined;
  }
  async addCredits(userId: number, amount: number, reason: string) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE users SET credits = credits + ? WHERE id = ?', [amount, userId]);
      await conn.execute('INSERT INTO credit_ledger (user_id, amount, reason) VALUES (?, ?, ?)', [userId, amount, reason]);
      const [rows] = await conn.execute<Row[]>('SELECT credits FROM users WHERE id = ?', [userId]);
      await conn.commit();
      return Number(rows[0]!.credits);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  async spendCredits(userId: number, amount: number, reason: string) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      // La condición credits >= ? hace que dos gastos simultáneos no dejen el saldo en negativo.
      const [res] = await conn.execute<ResultSetHeader>('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?', [amount, userId, amount]);
      if (!res.affectedRows) {
        await conn.rollback();
        return undefined;
      }
      await conn.execute('INSERT INTO credit_ledger (user_id, amount, reason) VALUES (?, ?, ?)', [userId, -amount, reason]);
      const [rows] = await conn.execute<Row[]>('SELECT credits FROM users WHERE id = ?', [userId]);
      await conn.commit();
      return Number(rows[0]!.credits);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  async ledger(userId: number, limit: number) {
    const [rows] = await this.pool.query<Row[]>('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?', [userId, limit]);
    return rows.map((r): LedgerEntry => ({ id: Number(r.id), userId, amount: Number(r.amount), reason: String(r.reason), createdAt: new Date(r.created_at as string) }));
  }
  async claimPayment(stripeSessionId: string, userId: number, amountCents: number, description: string) {
    const [res] = await this.pool.execute<ResultSetHeader>(
      'INSERT IGNORE INTO payments (stripe_session_id, user_id, amount_cents, description) VALUES (?, ?, ?, ?)',
      [stripeSessionId, userId, amountCents, description],
    );
    return res.affectedRows === 1;
  }
  async createLicense(l: Omit<License, 'id' | 'createdAt' | 'revoked'>) {
    const [res] = await this.pool.execute<ResultSetHeader>(
      'INSERT INTO licenses (license_key, user_id, modules, plan, expires_at) VALUES (?, ?, ?, ?, ?)',
      [l.key, l.userId, l.modules.join(','), l.plan, l.expiresAt],
    );
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM licenses WHERE id = ?', [res.insertId]);
    return toLicense(rows[0]!);
  }
  async licensesByUser(userId: number) {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM licenses WHERE user_id = ? ORDER BY id DESC', [userId]);
    return rows.map(toLicense);
  }
  async licenseByKey(key: string) {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM licenses WHERE license_key = ?', [key]);
    return rows[0] && toLicense(rows[0]);
  }
  async activations(licenseId: number) {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM activations WHERE license_id = ?', [licenseId]);
    return rows.map((r): Activation => ({
      licenseId,
      machineId: String(r.machine_id),
      machineName: String(r.machine_name),
      activatedAt: new Date(r.activated_at as string),
      lastSeen: new Date(r.last_seen as string),
    }));
  }
  async upsertActivation(licenseId: number, machineId: string, machineName: string) {
    await this.pool.execute(
      'INSERT INTO activations (license_id, machine_id, machine_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_seen = CURRENT_TIMESTAMP, machine_name = VALUES(machine_name)',
      [licenseId, machineId, machineName],
    );
  }
  async removeActivation(licenseId: number, machineId: string) {
    const [res] = await this.pool.execute<ResultSetHeader>('DELETE FROM activations WHERE license_id = ? AND machine_id = ?', [licenseId, machineId]);
    return res.affectedRows > 0;
  }
}
