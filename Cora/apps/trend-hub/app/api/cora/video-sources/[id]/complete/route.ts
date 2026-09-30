import { NextRequest } from 'next/server';
import { json } from '@/lib/cora/http';
import { auth, fail } from '@/lib/cora/video/http';
import { completeSource } from '@/lib/cora/video/clips';
export const runtime = 'nodejs';
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = auth(req, true); if ('res' in a) return a.res;
  try { const { srt: _srt, ...s } = await completeSource(a.u.id, (await ctx.params).id); return json({ source: s }); } catch (e) { return fail(e); }
}
