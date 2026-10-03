import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoraStore } from '../lib/cora/store';
import { InstagramConnections, seal, unseal, IG_SCOPES } from '../lib/cora/instagram-connect';
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
  assert.equal(url.searchParams.get('scope'), IG_SCOPES.join(',')); assert.equal(url.searchParams.get('redirect_uri'), ENV.CORA_IG_REDIRECT_URI);
  const state = url.searchParams.get('state')!;
  const other = s.signup('ig-other@example.test', 'password123').id;
  await assert.rejects(ig.finish(other, 'code-1#_', state), /다른 계정/); // state is bound to the user and is consumed even on mismatch
  const st2 = new URL(ig.start(u)).searchParams.get('state')!;
  const status = await ig.finish(u, 'code-1#_', st2);
  assert.equal(status.connected, true); assert.equal(status.username, 'corner_books'); assert.equal(status.igUserId, '17841400000000001');
  const form = calls[0].init!.body as URLSearchParams; assert.equal(form.get('code'), 'code-1', '#_ is stripped'); assert.equal(form.get('client_id'), '990001'); assert.equal(form.get('grant_type'), 'authorization_code');
  await assert.rejects(ig.finish(u, 'code-1', st2), /만료/, 'state cannot be reused');
  assert.equal(await ig.token(u), 'long-1');
  assert.ok(!JSON.stringify(ig.status(u)).includes('long-1'), 'status never contains the token');
  const sealed = seal('secret-token', 'k'); assert.ok(!sealed.includes('secret-token')); assert.equal(unseal(sealed, 'k'), 'secret-token'); assert.throws(() => unseal(sealed, 'wrong'));
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
