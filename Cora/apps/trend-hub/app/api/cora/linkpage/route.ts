import { NextRequest } from 'next/server';
import { json, sameOrigin, user, body } from '@/lib/cora/http';
import { linkPages } from '@/lib/cora/linkpage';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export function GET(req: NextRequest) { const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401); return json(linkPages().get(u.id)); }
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const b = await body(req);
    if (b.action === 'delete') { linkPages().remove(u.id); return json(linkPages().get(u.id)); }
    if (b.action !== 'save') throw new Error('지원하지 않는 작업입니다.');
    linkPages().save(u.id, b.page); return json(linkPages().get(u.id));
  } catch (e) { return json({ error: e instanceof Error ? e.message : '저장 실패' }, 400); }
}
