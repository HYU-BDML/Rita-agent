import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { auth, fail } from '@/lib/cora/video/http';
import { withUserLock } from '@/lib/cora/video/lock';
import { videoStore } from '@/lib/cora/video/db';
import { cutClip, parseClipRequest } from '@/lib/cora/video/clips';
export const runtime = 'nodejs'; export const maxDuration = 320;
export async function GET(req: NextRequest) { const a = auth(req, false); if ('res' in a) return a.res; return json({ clips: videoStore().listClips(a.u.id, req.nextUrl.searchParams.get('sourceId') ?? undefined) }); }
/** POST {sourceId, segments:[index,...], pad?, burn?, track?, lang?, style?}. The clip spans the earliest selected start to the latest selected end. */
export async function POST(req: NextRequest) {
  const a = auth(req, true); if ('res' in a) return a.res; const u = a.u;
  try { return await withUserLock(u.id, async () => { const b = await body(req); if (typeof b.sourceId !== 'string') throw new Error('원본 영상이 필요합니다.'); const r = await cutClip(u.id, b.sourceId, parseClipRequest(b)); return json({ ...r, url: `/api/cora/video-clips/${r.clip.id}` }, 201); }); } catch (e) { return fail(e, '클립 자르기 실패'); }
}
