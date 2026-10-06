import { NextRequest } from 'next/server';
import { json } from '@/lib/cora/http';
import { auth, fail, readBytes } from '@/lib/cora/video/http';
import { attachSrt, SRT_MAX_BYTES } from '@/lib/cora/video/clips';
export const runtime = 'nodejs';
/** POST the SRT file as the raw body (text/plain, UTF-8, <=1MB). Returns the parsed segments. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = auth(req, true); if ('res' in a) return a.res;
  try { const segments = attachSrt(a.u.id, (await ctx.params).id, (await readBytes(req, SRT_MAX_BYTES)).toString('utf8')); return json({ segments }); } catch (e) { return fail(e); }
}
