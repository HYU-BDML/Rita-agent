import { NextRequest } from 'next/server';
import { store } from '@/lib/cora/store';
import { json, user, sameOrigin, body } from '@/lib/cora/http';
import { listRevisions, restoreRevision } from '@/lib/cora/editor/revisions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NOT_FOUND = { error: '작업 또는 버전을 찾을 수 없습니다.' };
export function GET(req: NextRequest) {
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  const projectId = req.nextUrl.searchParams.get('projectId') ?? '';
  try { return json({ revisions: listRevisions(store(), u.id, projectId) }); }
  catch { return json(NOT_FOUND, 404); }
}
/** Restore returns the old body as an unsaved draft; saving it as a new version is the client's next PUT. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const b = await body(req);
    if (b?.action !== 'restore') return json({ error: '지원하지 않는 요청입니다.' }, 400);
    return json(restoreRevision(store(), u.id, String(b.projectId ?? ''), b.version, b.currentVersion));
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    if (m === 'NOT_FOUND') return json(NOT_FOUND, 404);
    if (m === 'CONFLICT') return json({ error: '다른 창에서 수정했습니다. 저장본을 다시 열어 주세요.' }, 409);
    return json({ error: m || '복원 실패' }, 400);
  }
}
