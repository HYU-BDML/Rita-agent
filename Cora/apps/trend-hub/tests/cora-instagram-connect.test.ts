import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoraStore } from '../lib/cora/store';
import { InstagramConnections, seal, unseal, IG_SCOPES, IG_READ_SCOPES } from '../lib/cora/instagram-connect';
import { loopDailyTick, loopOf } from '../lib/cora/loop-service';
import { integrationStatus } from '../lib/cora/integrations';

const ENV = { CORA_IG_APP_ID: '990001', CORA_IG_APP_SECRET: 'sec-XYZ', CORA_IG_REDIRECT_URI: 'https://cora.example/api/cora/connect/instagram/callback', CORA_SECRET_KEY: 'k-123' };
const DAY = 86400000;
type Call = { url: string; init?: RequestInit };
function fakeInstagram(calls: Call[], opts: { refresh?: boolean; fail?: boolean } = {}) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init }); const u = new URL(url); const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (opts.fail) return new Response('{}', { status: 400 });
    if (u.host === 'api.instagram.com') return ok({ data: [{ access_token: 'short-1', user_id: '1789', permissions: IG_SCOPES.join(',') }] });
    if (u.pathname === '/access_token') return ok({ access_token: 'long-1', token_type: 'bearer', expires_in: 5184000 });
    if (u.pathname === '/refresh_access_token') return ok({ access_token: 'long-2', expires_in: 5184000 });
    if (u.pathname.endsWith('/me')) return ok({ user_id: '17841400000000001', username: 'corner_books' });
    if (u.pathname.endsWith('/insights')) return ok({ data: [{ name: 'reach', values: [{ value: 500 }] }, { name: 'saved', values: [{ value: 25 }] }, { name: 'shares', values: [{ value: 9 }] }] });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
}
const setup = (env: Record<string, string> = ENV, transport?: typeof fetch, clock = { t: Date.UTC(2026, 9, 3, 3) }) => {
  const s = new CoraStore(':memory:'); const u = s.signup(`ig-${Math.random()}@example.test`, 'password123').id;
  const ig = s.module('instagram-connect', db => new InstagramConnections(db, env, transport ?? fakeInstagram([]), () => clock.t));
  return { s, u, ig, clock };
};

test('Instagram connect: consent URL uses the Instagram App ID, scopes and a single-use state; tokens are sealed', async () => {
  const calls: Call[] = []; const { s, u, ig } = setup(ENV, fakeInstagram(calls));
  const url = new URL(ig.start(u));
  assert.equal(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), '990001'); assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), IG_READ_SCOPES.join(',')); assert.equal(url.searchParams.get('redirect_uri'), ENV.CORA_IG_REDIRECT_URI);
  const state = url.searchParams.get('state')!;
  const other = s.signup('ig-other@example.test', 'password123').id;
  await assert.rejects(ig.finish(other, 'code-1#_', state), /다른 계정/); // Another user must not consume the owner's state.
  assert.equal(calls.length, 0);
  const st2 = state;
  const status = await ig.finish(u, 'code-1#_', st2);
  assert.equal(status.connected, true); assert.equal(status.username, 'corner_books'); assert.equal(status.igUserId, '17841400000000001');
  assert.equal(status.accounts[0].access, 'read'); assert.deepEqual(status.accounts[0].scopes, IG_READ_SCOPES);
  const form = calls[0].init!.body as URLSearchParams; assert.equal(form.get('code'), 'code-1', '#_ is stripped'); assert.equal(form.get('client_id'), '990001'); assert.equal(form.get('grant_type'), 'authorization_code');
  await assert.rejects(ig.finish(u, 'code-1', st2), /만료/, 'state cannot be reused');
  assert.equal(await ig.token(u), 'long-1');
  assert.ok(!JSON.stringify(ig.status(u)).includes('long-1'), 'status never contains the token');
  const sealed = seal('secret-token', 'k'); assert.ok(!sealed.includes('secret-token')); assert.equal(unseal(sealed, 'k'), 'secret-token'); assert.throws(() => unseal(sealed, 'wrong'));
});

test('Instagram connect: publishing scope requires an explicit manage connection; reconnect records changed access', async () => {
  const { u, ig } = setup();
  const read = new URL(ig.start(u));
  assert.equal(read.searchParams.get('scope'), IG_READ_SCOPES.join(','));
  await ig.finish(u, 'read-code', read.searchParams.get('state'));
  assert.equal(ig.accounts(u)[0].access, 'read');
  const manage = new URL(ig.start(u, 'manage'));
  assert.equal(manage.searchParams.get('scope'), IG_SCOPES.join(','));
  await ig.finish(u, 'manage-code', manage.searchParams.get('state'));
  assert.equal(ig.accounts(u)[0].access, 'manage');
});

test('Instagram connect: missing settings are reported by name; tokens refresh when close to expiry; disconnect removes them', async () => {
  const none = setup({});
  assert.throws(() => none.ig.start(none.u), (e: { status?: number; message: string }) => e.status === 503 && /CORA_IG_APP_ID/.test(e.message));
  assert.equal(none.ig.status(none.u).configured, false);
  const calls: Call[] = []; const { u, ig, clock } = setup(ENV, fakeInstagram(calls));
  await ig.finish(u, 'c', new URL(ig.start(u)).searchParams.get('state'));
  clock.t += 55 * DAY; assert.equal(await ig.token(u), 'long-2', 'refreshed with fewer than 7 days left');
  assert.ok(calls.some(c => c.url.includes('refresh_access_token')));
  assert.equal(ig.disconnect(u), true); assert.equal(await ig.token(u), null); assert.equal(ig.status(u).connected, false);
  const bad = setup(ENV, fakeInstagram([], { fail: true })); await assert.rejects(bad.ig.finish(bad.u, 'c', new URL(bad.ig.start(bad.u)).searchParams.get('state')), /HTTP 400/);
});

test('Loop daily tick: once per Korean day after the set hour, collects Instagram insights for connected users and notifies', async () => {
  const calls: Call[] = []; const { s, u, ig, clock } = setup(ENV, fakeInstagram(calls));
  await ig.finish(u, 'c', new URL(ig.start(u)).searchParams.get('state'));
  const loop = loopOf(s); loop.registerPost(u, { title: '릴스', platform: 'instagram', accountLabel: '@corner_books', postedAt: new Date(clock.t - 3 * DAY).toISOString(), mediaId: '1790' }, clock.t);
  clock.t = Date.UTC(2026, 9, 3, 23); // 08:00 KST on 10-04: before the 9 o'clock default
  assert.deepEqual(await loopDailyTick(s, clock.t, { ig, transport: fakeInstagram(calls), hour: 9 }), []);
  clock.t = Date.UTC(2026, 9, 4, 1); // 10:00 KST
  const first = await loopDailyTick(s, clock.t, { ig, transport: fakeInstagram(calls), hour: 9 });
  assert.equal(first.length, 1); assert.equal(first[0].collected, 1);
  const snap = loop.snapshots(u)[0]; assert.equal(snap.source, 'instagram'); assert.equal(snap.saves, 25); assert.equal(snap.day, '2026-10-04');
  assert.deepEqual(await loopDailyTick(s, clock.t + 3600000, { ig, transport: fakeInstagram(calls), hour: 9 }), [], 'second run the same day does nothing');
  assert.ok(integrationStatus(ENV).find(i => i.id === 'instagram-login')!.configured);
});

test('Instagram connect: one Cora user can connect several accounts; daily collection uses the token of the account each post was published from', async () => {
  const names = ['corner_books', 'corner_cafe']; let me = 0; const usedTokens: string[] = [];
  const t = (async (url: string, init?: RequestInit) => { const u = new URL(url); const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.host === 'api.instagram.com') return ok({ access_token: `short-${me}` });
    if (u.pathname === '/access_token') return ok({ access_token: `long-${names[me]}`, expires_in: 5184000 });
    if (u.pathname.endsWith('/me')) { const n = names[me]; me++; return ok({ user_id: n === 'corner_books' ? '111' : '222', username: n }); }
    if (u.pathname.endsWith('/insights')) { usedTokens.push(String((init?.headers as Record<string, string>).Authorization)); return ok({ data: [{ name: 'reach', values: [{ value: 10 }] }] }); }
    return new Response('{}', { status: 404 }); }) as unknown as typeof fetch;
  const { s, u, ig, clock } = setup(ENV, t);
  for (let i = 0; i < 2; i++) await ig.finish(u, 'c', new URL(ig.start(u)).searchParams.get('state'));
  assert.deepEqual(ig.accounts(u).map(a => a.username), ['corner_books', 'corner_cafe']); assert.equal(ig.status(u).connected, true);
  const loop = loopOf(s);
  for (const [label, media] of [['@corner_cafe', '9001'], ['@Corner_Books', '9002'], ['@someone_else', '9003']]) loop.registerPost(u, { title: label, platform: 'instagram', accountLabel: label, postedAt: new Date(clock.t - 2 * DAY).toISOString(), mediaId: media }, clock.t);
  const { tokenForPost } = await import('../lib/cora/loop-service');
  const r = await loop.collectInstagram(u, tokenForPost(ig, u), t, clock.t);
  assert.equal(r.filter(x => x.ok).length, 2); assert.match(r.find(x => !x.ok)!.detail, /someone_else/);
  assert.deepEqual(usedTokens.sort(), ['Bearer long-corner_books', 'Bearer long-corner_cafe']);
  assert.equal(ig.disconnect(u, '222'), true); assert.deepEqual(ig.accounts(u).map(a => a.username), ['corner_books']);
});


test('legacy Instagram connections survive upgrade without resurrection after disconnect', async () => {
  const s = new CoraStore(':memory:');
  const user = s.signup('legacy@example.test', 'password123').id;
  const now = Date.UTC(2026, 9, 3), encrypted = seal('legacy-token', ENV.CORA_SECRET_KEY);
  const db = s.module('legacy-fixture', db => db);
  db.exec(`CREATE TABLE ig_connections(user_id TEXT PRIMARY KEY REFERENCES users(id),ig_user_id TEXT NOT NULL,username TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,connected INTEGER NOT NULL,refreshed INTEGER NOT NULL)`);
  db.prepare('INSERT INTO ig_connections VALUES (?,?,?,?,?,?,?)').run(user, '111', 'legacy', encrypted, now + 60 * DAY, now, now);
  const ig = new InstagramConnections(db, ENV, fakeInstagram([]), () => now);
  assert.equal(await ig.token(user, '111'), 'legacy-token');
  assert.equal((db.prepare('SELECT token FROM ig_accounts').get() as { token: string }).token, encrypted);
  await ig.finish(user, 'code', new URL(ig.start(user)).searchParams.get('state'));
  assert.equal(ig.accounts(user).length, 2);
  assert.equal(ig.disconnect(user, '111'), true);
  const reopened = new InstagramConnections(db, ENV, fakeInstagram([]), () => now);
  assert.equal(reopened.accounts(user).length, 1);
  assert.equal(reopened.accounts(user)[0].username, 'corner_books');
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='ig_connections'").get(), undefined);
});

test('existing Instagram account rows migrate without assuming publishing permission', () => {
  const s = new CoraStore(':memory:');
  const user = s.signup('old-scopes@example.test', 'password123').id;
  const db = s.module('old-instagram', db => db);
  db.exec(`CREATE TABLE ig_oauth_states(state TEXT PRIMARY KEY,user_id TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE ig_accounts(user_id TEXT NOT NULL,ig_user_id TEXT NOT NULL,username TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,connected INTEGER NOT NULL,refreshed INTEGER NOT NULL,PRIMARY KEY(user_id,ig_user_id));`);
  const now = Date.UTC(2026, 9, 4);
  db.prepare('INSERT INTO ig_accounts VALUES (?,?,?,?,?,?,?)').run(user, '111', 'old', seal('old-token', ENV.CORA_SECRET_KEY), now + 60 * DAY, now, now);
  const ig = new InstagramConnections(db, ENV, fakeInstagram([]), () => now);
  assert.equal(ig.accounts(user)[0].access, 'unknown');
  assert.deepEqual(ig.accounts(user)[0].scopes, []);
  assert.equal(ig.start(user).includes('instagram_business_content_publish'), false);
});


test('OAuth transport failures never expose token exchange URLs or secrets', async () => {
  let calls = 0;
  const transport = (async (url: string) => {
    if (++calls === 1) return new Response(JSON.stringify({ access_token: 'sensitive-short-token' }));
    throw new Error(`Request failed: ${url}`);
  }) as typeof fetch;
  const { u, ig } = setup(ENV, transport);
  await assert.rejects(ig.finish(u, 'code', new URL(ig.start(u)).searchParams.get('state')), error => {
    assert.equal((error as { status: number }).status, 502);
    assert.ok(!String(error).includes('sensitive-short-token'));
    assert.ok(!String(error).includes(ENV.CORA_IG_APP_SECRET));
    return true;
  });
});

test('expired OAuth state is consumed without contacting Instagram', async () => {
  const calls: Call[] = []; const { ig, u, clock } = setup(ENV, fakeInstagram(calls));
  const state = new URL(ig.start(u)).searchParams.get('state');
  clock.t += 11 * 60000;
  await assert.rejects(ig.finish(u, 'code', state), /만료/);
  clock.t -= 11 * 60000;
  await assert.rejects(ig.finish(u, 'code', state), /만료/);
  assert.equal(calls.length, 0);
});
