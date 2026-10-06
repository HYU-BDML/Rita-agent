import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { attributeSignup, referrals } from '@/lib/cora/platform/referral';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export function GET(req: NextRequest) { const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401); return json(referrals().summary(u.id)); }
/** POST {action:'claim', code}: the newly signed-up account attributes its referrer once. Accounts that already saved projects are refused. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const b = await body(req); if (b.action !== 'claim') throw new Error('지원하지 않는 작업입니다.');
    if (store().list(u.id).length > 0) throw new Error('추천 코드는 첫 작업을 저장하기 전 새 계정에서만 쓸 수 있습니다.');
    const r = attributeSignup(u.id, b.code); return json({ status: r.status, credits: r.credits }, 201);
  } catch (e) { return json({ error: e instanceof Error ? e.message : '추천 코드 사용 실패' }, 400); }
}
