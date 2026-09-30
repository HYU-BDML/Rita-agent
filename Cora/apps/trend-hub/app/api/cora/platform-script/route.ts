import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { scriptToDraft } from '@/lib/cora/platform/script-import';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** POST {script, brand, audience?, goal?, title?} -> {draft, scenes}. Pure text split, no AI, nothing saved. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try { const b = await body(req); return json(scriptToDraft({ script: b.script, brand: String(b.brand ?? '').trim(), audience: typeof b.audience === 'string' ? b.audience : undefined, goal: typeof b.goal === 'string' && b.goal.trim() ? b.goal : undefined, title: typeof b.title === 'string' ? b.title : undefined })); }
  catch (e) { return json({ error: e instanceof Error ? e.message : '대본 가져오기 실패' }, 400); }
}
