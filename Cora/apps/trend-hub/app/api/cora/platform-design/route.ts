import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { generateText } from '@/lib/cora/gateway';
import { assistDesign } from '@/lib/cora/platform/design-assist';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** POST {draft, instruction} -> {draft, applied, rejected}. Never saves; the client saves through the normal project routes. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const b = await body(req);
    if (store().generationCount(u.id) >= 10) return json({ error: '하루 10회 로컬 생성 한도입니다.' }, 429);
    return json(await assistDesign(b.draft, b.instruction, async p => { store().addItem(u.id, 'run', 'AI 디자인 수정 요청', {}); return (await generateText(u.id, p)).text; }));
  } catch (e) { return json({ error: e instanceof Error ? e.message : '디자인 수정 실패' }, 400); }
}
