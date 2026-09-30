import { NextRequest } from 'next/server';
import { store } from '@/lib/cora/store';
import { attributeSignup } from '@/lib/cora/platform/referral';
import { COOKIE, json, user, sameOrigin, body, allowAuth } from '@/lib/cora/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(req: NextRequest) { return json({ user: user(req) ?? null }); }
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '같은 사이트에서 요청해 주세요.' }, 403);
  if (!allowAuth(req)) return json({ error: '시도가 많습니다. 잠시 후 다시 해 주세요.' }, 429);
  try {
    const b = await body(req); const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 128 || !['signup','login'].includes(b.mode)) return json({ error: '이메일과 10~128자 비밀번호를 입력해 주세요.' }, 400);
    const account = b.mode === 'signup' ? store().signup(email, b.password) : store().login(email, b.password);
    // A bad or missing referral code must never block signup.
    if (b.mode === 'signup' && typeof b.ref === 'string' && b.ref) { try { attributeSignup(account.id, b.ref); } catch { /* ignore */ } }
    const token = store().createSession(account.id); const res = json({ user: account });
    res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: new URL(req.headers.get('origin') || req.url).protocol === 'https:', path: '/api/cora', maxAge: 7 * 86400 }); return res;
  } catch (e) { return json({ error: e instanceof Error ? e.message : '로그인할 수 없습니다.' }, 400); }
}
export function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  store().logout(req.cookies.get(COOKIE)?.value ?? ''); const res = json({ ok: true }); res.cookies.set(COOKIE, '', { path: '/api/cora', maxAge: 0, httpOnly: true, sameSite: 'lax' }); return res;
}
