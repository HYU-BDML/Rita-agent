import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { generateText } from '@/lib/cora/gateway';
import { makeReferenceIdeas } from '@/lib/cora/platform/reference-ideas';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** POST {url | text, brand?, audience?} -> five ideas saved as a material work item with source URL and fetched-at. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const b = await body(req);
    if (store().generationCount(u.id) >= 10) return json({ error: '하루 10회 로컬 생성 한도입니다.' }, 429);
    const r = await makeReferenceIdeas(u.id, b, async p => { store().addItem(u.id, 'run', 'AI 참고 콘텐츠 아이디어 요청', {}); return (await generateText(u.id, p)).text; });
    return json(r, 201);
  } catch (e) { return json({ error: e instanceof Error ? e.message : '아이디어 만들기 실패' }, 400); }
}
