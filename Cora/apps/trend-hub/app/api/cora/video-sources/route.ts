import { NextRequest } from 'next/server';
import { json, body } from '@/lib/cora/http';
import { auth, fail } from '@/lib/cora/video/http';
import { videoStore } from '@/lib/cora/video/db';
import { beginSource, CHUNK_MAX_BYTES } from '@/lib/cora/video/clips';
export const runtime = 'nodejs';
const brief = ({ srt, ...s }: ReturnType<ReturnType<typeof videoStore>['listSources']>[number]) => ({ ...s, segmentCount: srt?.length ?? 0 });
export async function GET(req: NextRequest) { const a = auth(req, false); if ('res' in a) return a.res; return json({ sources: videoStore().listSources(a.u.id).map(brief) }); }
/**
 * E207 upload protocol (chunked, because Next middleware buffers request bodies and a single 200 MB body would be cut):
 * 1) POST {name, size<=200MB} here -> {source:{id}, chunkBytes}. 2) POST /video-sources/:id/chunk?offset=N with the raw bytes (<=8MB) until received==size.
 * 3) POST /video-sources/:id/complete (ffprobe check). 4) POST /video-sources/:id/srt with the SRT text (<=1MB).
 */
export async function POST(req: NextRequest) { const a = auth(req, true); if ('res' in a) return a.res; try { return json({ source: brief(beginSource(a.u.id, await body(req))), chunkBytes: CHUNK_MAX_BYTES }, 201); } catch (e) { return fail(e); } }
