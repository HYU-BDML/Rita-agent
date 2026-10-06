import { NextRequest } from 'next/server';
import { body, json, sameOrigin, user } from '@/lib/cora/http';
import { knowledge } from '@/lib/cora/platform/knowledge';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export function GET(req: NextRequest) {
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try { const b = req.nextUrl.searchParams.get('brand'); return json({ sources: knowledge().list(u.id, b === null ? undefined : b) }); } catch (e) { return json({ error: (e as Error).message }, 400); }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const b = await body(req), k = knowledge();
    if (b.action === 'note') return json({ source: k.addNote(u.id, b.brand, b.title, b.text) }, 201);
    if (b.action === 'file') return json({ source: k.addFile(u.id, b.brand, b.name, b.content) }, 201);
    if (b.action === 'link') return json({ source: await k.addLink(u.id, b.brand, b.url) }, 201);
    if (b.action === 'delete') return k.delete(u.id, String(b.id ?? '')) ? json({ deleted: true }) : json({ error: '자료를 찾을 수 없습니다.' }, 404);
    throw new Error('지원하지 않는 작업입니다.');
  } catch (e) { return json({ error: e instanceof Error ? e.message : '지식자료 작업 실패' }, 400); }
}
