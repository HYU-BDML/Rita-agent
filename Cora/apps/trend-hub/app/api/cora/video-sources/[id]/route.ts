import { NextRequest } from 'next/server';
import { json } from '@/lib/cora/http';
import { auth } from '@/lib/cora/video/http';
import { videoStore } from '@/lib/cora/video/db';
import { removeSource } from '@/lib/cora/video/clips';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };
/** Source details including the subtitle segments [{index,start,end,text}] the clip request selects from. */
export async function GET(req: NextRequest, ctx: Ctx) { const a = auth(req, false); if ('res' in a) return a.res; const s = videoStore().getSource(a.u.id, (await ctx.params).id); if (!s) return json({ error: '원본 영상을 찾을 수 없습니다.' }, 404); const { srt, ...rest } = s; return json({ source: rest, segments: srt ?? [] }); }
export async function DELETE(req: NextRequest, ctx: Ctx) { const a = auth(req, true); if ('res' in a) return a.res; return await removeSource(a.u.id, (await ctx.params).id) ? json({ deleted: true }) : json({ error: '원본 영상을 찾을 수 없습니다.' }, 404); }
