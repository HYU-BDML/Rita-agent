import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { store } from './store';

/** In-memory fixed-window limiter (single process; a shared store is needed before multi-instance operation). */
export class Limiter {
  private hits = new Map<string, { n: number; until: number }>();
  constructor(private max: number, private windowMs: number) {}
  /** Counts one hit and reports whether it is allowed, plus remaining allowance. */
  hit(key: string, now = Date.now()) {
    for (const [k, v] of this.hits) if (v.until <= now) this.hits.delete(k);
    const h = this.hits.get(key) ?? { n: 0, until: now + this.windowMs }; h.n++; this.hits.set(key, h);
    return { allowed: h.n <= this.max, remaining: Math.max(0, this.max - h.n), resetMs: h.until - now };
  }
}
export const clientIp = (req: { headers: { get(n: string): string | null } }) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';

/** F106 personal API keys. Plaintext is returned once at creation; only sha256 and the last 4 characters are stored. */
export const API_KEY_PREFIX = 'cora_';
export const MAX_ACTIVE_KEYS = 10;
export const API_RATE_LIMIT = 60;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
export type ApiKeyInfo = { id: string; name: string; last4: string; created: string; revoked: boolean };

export class ApiKeys {
  readonly limiter = new Limiter(API_RATE_LIMIT, 60_000);
  constructor(private db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, last4 TEXT NOT NULL, created TEXT NOT NULL, revoked TEXT);
      CREATE INDEX IF NOT EXISTS api_keys_user ON api_keys(user_id);`);
  }
  create(userId: string, name: unknown): ApiKeyInfo & { key: string } {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) throw new Error('키 이름은 1~60자로 입력해 주세요.');
    const active = (this.db.prepare('SELECT COUNT(*) c FROM api_keys WHERE user_id=? AND revoked IS NULL').get(userId) as { c: number }).c;
    if (active >= MAX_ACTIVE_KEYS) throw new Error(`사용 중인 키는 ${MAX_ACTIVE_KEYS}개까지입니다. 쓰지 않는 키를 폐기해 주세요.`);
    const key = API_KEY_PREFIX + randomBytes(24).toString('base64url'); const id = randomUUID(); const created = new Date().toISOString();
    this.db.prepare('INSERT INTO api_keys VALUES (?,?,?,?,?,?,NULL)').run(id, userId, name.trim(), sha(key), key.slice(-4), created);
    return { id, name: name.trim(), last4: key.slice(-4), created, revoked: false, key };
  }
  list(userId: string): ApiKeyInfo[] {
    return (this.db.prepare('SELECT id,name,last4,created,revoked FROM api_keys WHERE user_id=? ORDER BY created DESC').all(userId) as { id: string; name: string; last4: string; created: string; revoked: string | null }[])
      .map(r => ({ id: r.id, name: r.name, last4: r.last4, created: r.created, revoked: !!r.revoked }));
  }
  revoke(userId: string, id: string) { return this.db.prepare('UPDATE api_keys SET revoked=? WHERE id=? AND user_id=? AND revoked IS NULL').run(new Date().toISOString(), String(id).slice(0, 80), userId).changes > 0; }
  /** Owner of an active key, or null. */
  verify(token: string): { userId: string; keyId: string } | null {
    if (!token.startsWith(API_KEY_PREFIX) || token.length > 200) return null;
    const r = this.db.prepare('SELECT id,user_id FROM api_keys WHERE hash=? AND revoked IS NULL').get(sha(token)) as { id: string; user_id: string } | undefined;
    return r ? { userId: r.user_id, keyId: r.id } : null;
  }
}
export const apiKeys = () => store().module('apikeys', db => new ApiKeys(db));

export type ApiAuth = { ok: true; userId: string; keyId: string; remaining: number } | { ok: false; status: 401 | 429; error: string; retryAfter?: number };
/** Reads `Authorization: Bearer cora_...`; applies the 60/min per-key limit. */
export function authenticateApiKey(req: { headers: { get(n: string): string | null } }, keys: ApiKeys = apiKeys(), now = Date.now()): ApiAuth {
  const m = /^Bearer\s+(cora_[A-Za-z0-9_-]+)$/.exec((req.headers.get('authorization') ?? '').trim());
  const who = m ? keys.verify(m[1]) : null;
  if (!who) return { ok: false, status: 401, error: 'API 키가 없거나 올바르지 않습니다. Authorization: Bearer cora_... 헤더를 확인해 주세요.' };
  const h = keys.limiter.hit(who.keyId, now);
  if (!h.allowed) return { ok: false, status: 429, error: `요청이 너무 많습니다. 분당 ${API_RATE_LIMIT}회까지 호출할 수 있습니다.`, retryAfter: Math.ceil(h.resetMs / 1000) };
  return { ok: true, userId: who.userId, keyId: who.keyId, remaining: h.remaining };
}
