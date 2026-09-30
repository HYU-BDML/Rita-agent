import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { apiKeys } from '@/lib/cora/apikeys';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export function GET(req: NextRequest) { const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401); return json({ keys: apiKeys().list(u.id) }); }
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const b = await body(req); const k = apiKeys();
    if (b.action === 'create') { const made = k.create(u.id, b.name); return json({ created: made, keys: k.list(u.id), notice: '이 키는 지금 한 번만 표시됩니다. 안전한 곳에 복사해 두세요.' }, 201); }
    if (b.action === 'revoke') { if (!k.revoke(u.id, String(b.id ?? ''))) return json({ error: '키를 찾을 수 없거나 이미 폐기되었습니다.' }, 404); return json({ keys: k.list(u.id) }); }
    throw new Error('지원하지 않는 작업입니다.');
  } catch (e) { return json({ error: e instanceof Error ? e.message : '키 작업 실패' }, 400); }
}
