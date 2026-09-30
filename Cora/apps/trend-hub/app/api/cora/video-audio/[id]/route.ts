import { NextRequest } from 'next/server';
import { json } from '@/lib/cora/http';
import { auth } from '@/lib/cora/video/http';
import { removeAudio } from '@/lib/cora/video/audio';
export const runtime = 'nodejs';
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = auth(req, true); if ('res' in a) return a.res; const { id } = await ctx.params;
  return await removeAudio(a.u.id, id).catch(() => false) ? json({ deleted: true }) : json({ error: '배경음악을 찾을 수 없습니다.' }, 404);
}
