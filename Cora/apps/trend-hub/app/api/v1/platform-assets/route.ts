import { NextRequest } from 'next/server';
import { store } from '@/lib/cora/store';
import { v1Read } from '@/lib/cora/platform/v1';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** Read-only. GET /api/v1/platform-assets?id=... lists the card photos of one project (metadata only, no image bytes). */
export function GET(req: NextRequest) {
  return v1Read(req, userId => {
    const id = (req.nextUrl.searchParams.get('id') ?? '').slice(0, 80); if (!id) return { status: 400, body: { error: 'id 쿼리가 필요합니다.' } };
    const p = store().get(userId, id); if (!p) return { status: 404, body: { error: '작업을 찾을 수 없습니다.' } };
    const assets = p.slides.flatMap((s, i) => { if (!s.image) return []; const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(s.image); return [{ card: i + 1, slideId: s.id, mimeType: m?.[1] ?? 'unknown', bytes: m ? Math.floor(m[2].length * 3 / 4) : 0 }]; });
    return { body: { projectId: id, version: p.version, assets } };
  });
}
