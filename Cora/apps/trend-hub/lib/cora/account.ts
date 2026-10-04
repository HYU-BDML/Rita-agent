import type { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * Account export and deletion (F100). Works generically over every table that references a user through
 * user_id / owner_id / member_id / reviewer_id, so feature modules added later are covered automatically.
 * Billing tables are retained (append-only financial record); the users row is kept but anonymised so
 * those records keep a valid reference and the account can never log in again.
 */
const USER_COLUMNS = ['user_id', 'owner_id', 'member_id', 'reviewer_id', 'referrer_id', 'referred_id'];
// Deletion only removes rows the user owns or memberships; rows where the user acted for someone else (reviews, referrals) stay and point to the anonymised account.
const DELETE_COLUMNS = ['user_id', 'owner_id', 'member_id'];
const RETAINED = (t: string) => t.startsWith('billing_');
const SECRET_COLUMNS = new Set(['salt', 'hash', 'token', 'key_hash', 'secret', 'password']);
export const dataDir = () => process.env.CORA_DATA_DIR || path.join(process.cwd(), 'data', 'cora');

export class AccountService {
  constructor(private db: DatabaseSync) {}
  private tables() {
    const names = (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map(r => r.name);
    return names.map(name => ({ name, cols: (this.db.prepare(`PRAGMA table_info("${name.replace(/"/g, '')}")`).all() as { name: string }[]).map(c => c.name) }));
  }
  /** Rows referencing the user, table by table, with secret columns removed. Sessions and users.hash/salt are never exported. */
  export(userId: string) {
    const out: Record<string, unknown[]> = {};
    for (const t of this.tables()) {
      if (t.name === 'sessions') continue;
      const keys = t.name === 'users' ? ['id'] : t.cols.filter(c => USER_COLUMNS.includes(c));
      if (!keys.length) continue;
      const rows = this.db.prepare(`SELECT * FROM "${t.name}" WHERE ${keys.map(k => `"${k}"=?`).join(' OR ')}`).all(...keys.map(() => userId)) as Record<string, unknown>[];
      const visible=t.name==='reviews'?rows.filter(r=>{
        if(r.owner_id===userId)return true;
        if(r.reviewer_id!==userId||r.status==='cancelled')return false;
        const clientId=(JSON.parse(String(r.snapshot)) as {clientId?:string}).clientId;
        if(!clientId)return true;
        return !!this.db.prepare("SELECT t.id FROM team_members t JOIN team_client_grants g ON g.team_id=t.id AND g.owner_id=t.owner_id JOIN clients c ON c.id=g.client_id AND c.user_id=t.owner_id WHERE t.member_id=? AND t.owner_id=? AND t.status='active' AND t.scope='clients' AND g.client_id=?").get(userId,r.owner_id as string,clientId);
      }):rows;
      if(visible.length)out[t.name]=visible.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!SECRET_COLUMNS.has(k))));
    }
    return { exportedAt: new Date().toISOString(), userId, tables: out };
  }
  /** Deletes the user's content everywhere except retained billing records, anonymises the login, removes media files. */
  async delete(userId: string) {
    const deleted: Record<string, number> = {};
    this.db.exec('PRAGMA foreign_keys=OFF');
    try {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        for (const t of this.tables()) {
          if (t.name === 'users' || RETAINED(t.name)) continue;
          const keys = t.cols.filter(c => DELETE_COLUMNS.includes(c));
          if (!keys.length) continue;
          const n = this.db.prepare(`DELETE FROM "${t.name}" WHERE ${keys.map(k => `"${k}"=?`).join(' OR ')}`).run(...keys.map(() => userId)).changes;
          if (n) deleted[t.name] = Number(n);
        }
        // Child rows keyed by a deleted parent (revisions, job events, run logs) are removed via the FK checker.
        for (let pass = 0; pass < 10; pass++) {
          const orphans = this.db.prepare('PRAGMA foreign_key_check').all() as { table: string; rowid: number | null; parent: string }[];
          const own = orphans.filter(o => o.rowid != null && !RETAINED(o.table) && o.parent !== 'users');
          if (!own.length) break;
          for (const o of own) { this.db.prepare(`DELETE FROM "${o.table}" WHERE rowid=?`).run(o.rowid); deleted[o.table] = (deleted[o.table] ?? 0) + 1; }
        }
        this.db.prepare('UPDATE users SET email=?, salt=?, hash=? WHERE id=?').run(`deleted-${userId}@deleted.invalid`, randomBytes(16).toString('hex'), randomBytes(64).toString('hex'), userId);
        this.db.exec('COMMIT');
      } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    } finally { this.db.exec('PRAGMA foreign_keys=ON'); }
    for (const sub of ['videos', 'video', 'media', 'uploads']) await rm(path.join(dataDir(), sub, userId), { recursive: true, force: true }).catch(() => {});
    await rm(path.join(dataDir(), userId), { recursive: true, force: true }).catch(() => {});
    return { deleted, retained: 'billing_* 기록은 결제·정산 근거로 남기고, 로그인 정보는 복구할 수 없게 지웠습니다.' };
  }
}
