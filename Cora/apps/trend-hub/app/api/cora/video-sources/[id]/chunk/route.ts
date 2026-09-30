import { NextRequest } from 'next/server';
import { json } from '@/lib/cora/http';
import { auth, fail, readBytes } from '@/lib/cora/video/http';
import { appendChunk, CHUNK_MAX_BYTES } from '@/lib/cora/video/clips';
export const runtime = 'nodejs';
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = auth(req, true); if ('res' in a) return a.res;
  try { const offset = Number(req.nextUrl.searchParams.get('offset')); return json(await appendChunk(a.u.id, (await ctx.params).id, offset, await readBytes(req, CHUNK_MAX_BYTES))); } catch (e) { return fail(e); }
}
