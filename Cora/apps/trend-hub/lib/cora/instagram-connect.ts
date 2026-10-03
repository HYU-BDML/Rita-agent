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
    db.exec(`CREATE TABLE IF NOT EXISTS ig_oauth_states(state TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ig_connections(user_id TEXT PRIMARY KEY REFERENCES users(id),ig_user_id TEXT NOT NULL,username TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,connected INTEGER NOT NULL,refreshed INTEGER NOT NULL);`);
  }
  private cfg() { const c = igConfig(this.env); if (!c.configured) throw Object.assign(new Error(`Instagram 연결 설정이 없습니다: ${c.missing.join(', ')}`), { status: 503 }); return c; }
  /** Authorization URL with a single-use state bound to this user. */
  start(user: string) {
    const c = this.cfg(); const state = randomBytes(24).toString('base64url');
    this.db.prepare('DELETE FROM ig_oauth_states WHERE created<?').run(this.now() - STATE_TTL);
    this.db.prepare('INSERT INTO ig_oauth_states VALUES (?,?,?)').run(state, user, this.now());
    const u = new URL('https://www.instagram.com/oauth/authorize');
    u.searchParams.set('client_id', c.appId); u.searchParams.set('redirect_uri', c.redirect); u.searchParams.set('response_type', 'code'); u.searchParams.set('scope', IG_SCOPES.join(',')); u.searchParams.set('state', state);
    return u.href;
  }
  private async json(url: string, init: RequestInit = {}) {
    const r = await this.transport(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
    let body: Record<string, unknown> | null = null; try { body = await r.json() as Record<string, unknown>; } catch { /* non-JSON */ }
    if (!r.ok || !body) throw Object.assign(new Error(`Instagram 응답 오류(HTTP ${r.status})`), { status: 502 });
    return body;
  }
  /** Callback: checks state (same user, unexpired, single use), exchanges the code, upgrades to a 60-day token, stores it encrypted. */
  async finish(user: string, code: unknown, state: unknown) {
    const c = this.cfg();
    if (typeof state !== 'string' || !state) throw new Error('연결 요청 확인값이 없습니다. 다시 연결해 주세요.');
    const row = this.db.prepare('SELECT user_id,created FROM ig_oauth_states WHERE state=?').get(state) as { user_id: string; created: number } | undefined;
    this.db.prepare('DELETE FROM ig_oauth_states WHERE state=?').run(state);
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
    this.db.prepare('INSERT INTO ig_connections VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET ig_user_id=excluded.ig_user_id,username=excluded.username,token=excluded.token,expires_at=excluded.expires_at,connected=excluded.connected,refreshed=excluded.refreshed')
      .run(user, igId, String(me.username ?? '').slice(0, 100), seal(token, c.key), t + expiresIn * 1000, t, t);
    return this.status(user);
  }
  status(user: string) {
    const c = igConfig(this.env); const r = this.db.prepare('SELECT ig_user_id,username,expires_at,connected FROM ig_connections WHERE user_id=?').get(user) as { ig_user_id: string; username: string; expires_at: number; connected: number } | undefined;
    return { configured: c.configured, missing: c.missing, connected: !!r && r.expires_at > this.now(), username: r?.username ?? null, igUserId: r?.ig_user_id ?? null, expiresAt: r ? new Date(r.expires_at).toISOString() : null, connectedAt: r ? new Date(r.connected).toISOString() : null };
  }
  /** Decrypted token for server-side calls; refreshes when fewer than 7 days remain and the token is at least 24h old. */
  async token(user: string) {
    const c = this.cfg(); const r = this.db.prepare('SELECT token,expires_at,refreshed FROM ig_connections WHERE user_id=?').get(user) as { token: string; expires_at: number; refreshed: number } | undefined;
    if (!r) return null; const t = this.now(); if (r.expires_at <= t) return null;
    let token = unseal(r.token, c.key);
    if (r.expires_at - t < 7 * DAY && t - r.refreshed >= DAY) {
      const u = new URL('https://graph.instagram.com/refresh_access_token'); u.searchParams.set('grant_type', 'ig_refresh_token'); u.searchParams.set('access_token', token);
      try { const b = await this.json(u.href); if (typeof b.access_token === 'string') { token = b.access_token; const exp = t + (Number(b.expires_in) > 0 ? Number(b.expires_in) : 60 * 86400) * 1000; this.db.prepare('UPDATE ig_connections SET token=?,expires_at=?,refreshed=? WHERE user_id=?').run(seal(token, c.key), exp, t, user); } }
      catch { /* keep the current token until it expires; the status screen shows the expiry */ }
    }
    return token;
  }
  disconnect(user: string) { return this.db.prepare('DELETE FROM ig_connections WHERE user_id=?').run(user).changes > 0; }
  /** Users with a stored connection, for the daily collection. */
  connectedUsers() { return (this.db.prepare('SELECT user_id FROM ig_connections WHERE expires_at>?').all(this.now()) as { user_id: string }[]).map(r => r.user_id); }
}
