import { NextRequest } from 'next/server';
import { store } from '@/lib/cora/store';
import { v1Read } from '@/lib/cora/platform/v1';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
/** Read-only. GET /api/v1/platform-project?id=... returns one project of the key owner, with card photos replaced by their sizes. */
export function GET(req: NextRequest) {
  return v1Read(req, userId => {
    const id = (req.nextUrl.searchParams.get('id') ?? '').slice(0, 80); if (!id) return { status: 400, body: { error: 'id 쿼리가 필요합니다.' } };
    const p = store().get(userId, id); if (!p) return { status: 404, body: { error: '작업을 찾을 수 없습니다.' } };
    return { body: { project: { ...p, slides: p.slides.map(({ image, ...s }) => ({ ...s, hasImage: !!image })) } } };
  });
}
