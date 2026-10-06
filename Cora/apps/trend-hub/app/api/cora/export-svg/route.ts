import { NextRequest } from 'next/server';
import { store } from '@/lib/cora/store';
import { json, user } from '@/lib/cora/http';
import { figmaZip } from '@/lib/cora/editor/figma-export';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** GET /api/cora/export-svg?projectId= returns a ZIP: cards/card-NN.svg, frames.svg (80px gaps), README.txt. Text stays <text>. */
export function GET(req: NextRequest) {
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  const p = store().getAccessible(u.id, req.nextUrl.searchParams.get('projectId') ?? '');
  if (!p) return json({ error: '작업을 찾을 수 없습니다.' }, 404);
  const bytes = figmaZip(p);
  return new Response(bytes.buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="cora-figma.zip"', 'Cache-Control': 'no-store' } });
}
