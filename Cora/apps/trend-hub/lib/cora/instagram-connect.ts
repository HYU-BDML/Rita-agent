import type { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { IG_API_VERSION } from './publishing/instagram';

/**
 * Instagram account connection ("Instagram API with Instagram Login", business login).
 * Contract checked 2026-10-03 against developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login:
 *  GET  https://www.instagram.com/oauth/authorize?client_id=<Instagram App ID>&redirect_uri&response_type=code&scope&state
 *  POST https://api.instagram.com/oauth/access_token (client_id, client_secret, grant_type=authorization_code, redirect_uri, code)
 *  GET  https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret&access_token  → 60-day token
 *  GET  https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token (token ≥24h old, still valid)
 * The code may arrive with "#_" appended; it is stripped. client_id is the Instagram App ID, not the Meta App ID.
 * Tokens are stored encrypted (AES-256-GCM, key from CORA_SECRET_KEY) and never returned to the browser.
 */
export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_insights', 'instagram_business_manage_comments'];
export const IG_READ_SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];
export const IG_ENV = ['CORA_IG_APP_ID', 'CORA_IG_APP_SECRET', 'CORA_IG_REDIRECT_URI', 'CORA_SECRET_KEY'] as const;
const DAY = 86400000, STATE_TTL = 10 * 60000;
type Env = Record<string, string | undefined>;
export function igConfig(env: Env = process.env) {
  const missing = IG_ENV.filter(k => !env[k]?.trim());
  return { configured: missing.length === 0, missing, appId: env.CORA_IG_APP_ID ?? '', secret: env.CORA_IG_APP_SECRET ?? '', redirect: env.CORA_IG_REDIRECT_URI ?? '', key: env.CORA_SECRET_KEY ?? '' };
}
const keyOf = (secret: string) => createHash('sha256').update(`cora-token-v1:${secret}`).digest();
export function seal(plain: string, secret: string) {
  if (!secret) throw new Error('CORA_SECRET_KEY가 없어 토큰을 저장할 수 없습니다.');
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', keyOf(secret), iv); const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${body.toString('base64')}`;
}
export function unseal(sealed: string, secret: string) {
  const [v, iv, tag, body] = sealed.split('.'); if (v !== 'v1' || !iv || !tag || !body) throw new Error('저장된 토큰 형식 오류');
  const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
}

export class InstagramConnections {
  constructor(private db: DatabaseSync, private env: Env = process.env, private transport: typeof fetch = fetch, private now: () => number = () => Date.now()) {
    db.exec(`CREATE TABLE IF NOT EXISTS ig_oauth_states(state TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created INTEGER NOT NULL,scopes TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS ig_accounts(user_id TEXT NOT NULL REFERENCES users(id),ig_user_id TEXT NOT NULL,username TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,connected INTEGER NOT NULL,refreshed INTEGER NOT NULL,scopes TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,ig_user_id));`);
    // Older connections did not record their granted scopes. Keep them unknown rather than assuming publish access.
    if (!(db.prepare('PRAGMA table_info(ig_oauth_states)').all() as { name: string }[]).some(c => c.name === 'scopes')) db.exec("ALTER TABLE ig_oauth_states ADD COLUMN scopes TEXT NOT NULL DEFAULT ''");
    if (!(db.prepare('PRAGMA table_info(ig_accounts)').all() as { name: string }[]).some(c => c.name === 'scopes')) db.exec("ALTER TABLE ig_accounts ADD COLUMN scopes TEXT NOT NULL DEFAULT ''");
    // Move legacy encrypted rows once. Retiring the source prevents a disconnected
    // account from reappearing on the next application restart.
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ig_connections'").get()) {
        db.exec(`INSERT OR IGNORE INTO ig_accounts(user_id,ig_user_id,username,token,expires_at,connected,refreshed)
          SELECT user_id,ig_user_id,username,token,expires_at,connected,refreshed FROM ig_connections;
          DROP TABLE ig_connections;`);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  private cfg() { const c = igConfig(this.env); if (!c.configured) throw Object.assign(new Error(`Instagram 연결 설정이 없습니다: ${c.missing.join(', ')}`), { status: 503 }); return c; }
  /** Authorization URL with a single-use state bound to this user. */
  start(user: string, access: 'read' | 'manage' = 'read') {
    const c = this.cfg(); const state = randomBytes(24).toString('base64url');
    const scopes = access === 'manage' ? IG_SCOPES : IG_READ_SCOPES;
    this.db.prepare('DELETE FROM ig_oauth_states WHERE created<?').run(this.now() - STATE_TTL);
    this.db.prepare('INSERT INTO ig_oauth_states(state,user_id,created,scopes) VALUES (?,?,?,?)').run(state, user, this.now(), scopes.join(','));
    const u = new URL('https://www.instagram.com/oauth/authorize');
    u.searchParams.set('client_id', c.appId); u.searchParams.set('redirect_uri', c.redirect); u.searchParams.set('response_type', 'code'); u.searchParams.set('scope', scopes.join(',')); u.searchParams.set('state', state);
    return u.href;
  }
  private async json(url: string, init: RequestInit = {}) {
    let r: Response;
    try { r = await this.transport(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
    catch { throw Object.assign(new Error('Instagram 연결 요청에 실패했습니다. 잠시 후 다시 연결해 주세요.'), { status: 502 }); }
    let body: Record<string, unknown> | null = null; try { body = await r.json() as Record<string, unknown>; } catch { /* non-JSON */ }
    if (!r.ok || !body) throw Object.assign(new Error(`Instagram 응답 오류(HTTP ${r.status})`), { status: 502 });
    return body;
  }
  /** Callback: checks state (same user, unexpired, single use), exchanges the code, upgrades to a 60-day token, stores it encrypted. */
  async finish(user: string, code: unknown, state: unknown) {
    const c = this.cfg();
    if (typeof state !== 'string' || !state) throw new Error('연결 요청 확인값이 없습니다. 다시 연결해 주세요.');
    const row = this.db.prepare('DELETE FROM ig_oauth_states WHERE state=? AND user_id=? RETURNING user_id,created,scopes').get(state, user) as { user_id: string; created: number; scopes: string } | undefined;
    if (!row || row.user_id !== user || this.now() - row.created > STATE_TTL) throw new Error('연결 요청이 만료됐거나 다른 계정의 요청입니다. 다시 연결해 주세요.');
    if (typeof code !== 'string' || !code.trim()) throw new Error('Instagram이 승인 코드를 보내지 않았습니다. 권한을 허용했는지 확인해 주세요.');
    const clean = code.replace(/#_$/, '').trim();
    const form = new URLSearchParams({ client_id: c.appId, client_secret: c.secret, grant_type: 'authorization_code', redirect_uri: c.redirect, code: clean });
    const short = await this.json('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
    const first = (Array.isArray(short.data) ? short.data[0] : short) as { access_token?: unknown } | undefined;
    if (typeof first?.access_token !== 'string') throw Object.assign(new Error('Instagram 단기 토큰을 받지 못했습니다.'), { status: 502 });
    const longUrl = new URL('https://graph.instagram.com/access_token'); longUrl.searchParams.set('grant_type', 'ig_exchange_token'); longUrl.searchParams.set('client_secret', c.secret); longUrl.searchParams.set('access_token', first.access_token);
    const long = await this.json(longUrl.href);
    if (typeof long.access_token !== 'string') throw Object.assign(new Error('Instagram 장기 토큰을 받지 못했습니다.'), { status: 502 });
    const token = long.access_token; const expiresIn = Number(long.expires_in) > 0 ? Number(long.expires_in) : 60 * 86400;
    const me = await this.json(`https://graph.instagram.com/${IG_API_VERSION}/me?fields=user_id,username`, { headers: { Authorization: `Bearer ${token}` } });
    const igId = String(me.user_id ?? me.id ?? ''); if (!/^[0-9]{1,40}$/.test(igId)) throw Object.assign(new Error('Instagram 계정 ID를 확인하지 못했습니다.'), { status: 502 });
    const t = this.now();
    this.db.prepare('INSERT INTO ig_accounts(user_id,ig_user_id,username,token,expires_at,connected,refreshed,scopes) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,ig_user_id) DO UPDATE SET username=excluded.username,token=excluded.token,expires_at=excluded.expires_at,connected=excluded.connected,refreshed=excluded.refreshed,scopes=excluded.scopes')
      .run(user, igId, String(me.username ?? '').slice(0, 100), seal(token, c.key), t + expiresIn * 1000, t, t, row.scopes);
    return this.status(user);
  }
  /** Every connected Instagram account of this Cora user (one user may run several accounts or brands). Never includes tokens. */
  accounts(user: string) {
    return (this.db.prepare('SELECT ig_user_id,username,expires_at,connected,scopes FROM ig_accounts WHERE user_id=? ORDER BY connected').all(user) as { ig_user_id: string; username: string; expires_at: number; connected: number; scopes: string }[])
      .map(r => ({ igUserId: r.ig_user_id, username: r.username, expiresAt: new Date(r.expires_at).toISOString(), connectedAt: new Date(r.connected).toISOString(), active: r.expires_at > this.now(), scopes: r.scopes ? r.scopes.split(',') : [], access: r.scopes === IG_READ_SCOPES.join(',') ? 'read' : r.scopes === IG_SCOPES.join(',') ? 'manage' : 'unknown' }));
  }
  status(user: string) {
    const c = igConfig(this.env); const accounts = this.accounts(user); const first = accounts.find(a => a.active) ?? accounts[0];
    return { configured: c.configured, missing: c.missing, connected: accounts.some(a => a.active), accounts, username: first?.username ?? null, igUserId: first?.igUserId ?? null, expiresAt: first?.expiresAt ?? null, connectedAt: first?.connectedAt ?? null };
  }
  /** Decrypted token for server-side calls (a given account, or the first one); refreshes when fewer than 7 days remain and the token is at least 24h old. */
  async token(user: string, igUserId?: string) {
    const c = this.cfg();
    const r = (igUserId ? this.db.prepare('SELECT ig_user_id,token,expires_at,refreshed FROM ig_accounts WHERE user_id=? AND ig_user_id=?').get(user, igUserId) : this.db.prepare('SELECT ig_user_id,token,expires_at,refreshed FROM ig_accounts WHERE user_id=? AND expires_at>? ORDER BY connected').get(user, this.now())) as { ig_user_id: string; token: string; expires_at: number; refreshed: number } | undefined;
    if (!r) return null; const t = this.now(); if (r.expires_at <= t) return null;
    let token = unseal(r.token, c.key);
    if (r.expires_at - t < 7 * DAY && t - r.refreshed >= DAY) {
      const u = new URL('https://graph.instagram.com/refresh_access_token'); u.searchParams.set('grant_type', 'ig_refresh_token'); u.searchParams.set('access_token', token);
      try { const b = await this.json(u.href); if (typeof b.access_token === 'string') { token = b.access_token; const exp = t + (Number(b.expires_in) > 0 ? Number(b.expires_in) : 60 * 86400) * 1000; this.db.prepare('UPDATE ig_accounts SET token=?,expires_at=?,refreshed=? WHERE user_id=? AND ig_user_id=?').run(seal(token, c.key), exp, t, user, r.ig_user_id); } }
      catch { /* keep the current token until it expires; the status screen shows the expiry */ }
    }
    return token;
  }
  /** Removes one account, or every account of this user when no id is given. */
  disconnect(user: string, igUserId?: string) { return (igUserId ? this.db.prepare('DELETE FROM ig_accounts WHERE user_id=? AND ig_user_id=?').run(user, igUserId) : this.db.prepare('DELETE FROM ig_accounts WHERE user_id=?').run(user)).changes > 0; }
  /** Users with a stored connection, for the daily collection. */
  connectedUsers() { return (this.db.prepare('SELECT DISTINCT user_id FROM ig_accounts WHERE expires_at>?').all(this.now()) as { user_id: string }[]).map(r => r.user_id); }
}
