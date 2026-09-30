import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { json } from '@/lib/cora/http';
import { auth } from '@/lib/cora/video/http';
import { videoStore } from '@/lib/cora/video/db';
import { clipPath, removeClip } from '@/lib/cora/video/clips';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Ctx) {
  const a = auth(req, false); if ('res' in a) return a.res; const id = (await ctx.params).id; if (!videoStore().getClip(a.u.id, id)) return json({ error: '클립을 찾을 수 없습니다.' }, 404);
  try { return new NextResponse(new Uint8Array(await readFile(clipPath(a.u.id, id))), { headers: { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="cora-clip.mp4"', 'Cache-Control': 'private, no-store' } }); } catch { return json({ error: '클립 파일이 없습니다.' }, 404); }
}
export async function DELETE(req: NextRequest, ctx: Ctx) { const a = auth(req, true); if ('res' in a) return a.res; return await removeClip(a.u.id, (await ctx.params).id).catch(() => false) ? json({ deleted: true }) : json({ error: '클립을 찾을 수 없습니다.' }, 404); }
