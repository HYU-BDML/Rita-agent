import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { json, user } from '@/lib/cora/http';
import { store } from '@/lib/cora/store';
import { videoPath } from '@/lib/cora/video';
export const runtime = 'nodejs';
/** GET ?format=mp4 (default) | srt (file name carries the language tag, e.g. cora-subtitles.kor.srt) | info (settings, settingsVersion, media manifest, warnings). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const u = user(req); if (!u) return json({ error: '로그인이 필요합니다.' }, 401);
  const { id } = await ctx.params; const item = store().item(u.id, id); if (!item || item.kind !== 'video') return json({ error: '영상을 찾을 수 없습니다.' }, 404);
  if (item.data.status !== 'ready') return json({ error: '영상이 준비되지 않았습니다.' }, 409);
  const format = req.nextUrl.searchParams.get('format') ?? 'mp4'; if (!['mp4', 'srt', 'info'].includes(format)) return json({ error: '지원하지 않는 파일 형식입니다.' }, 400);
  if (format === 'info') { const { scenes: _s, ...rest } = item.data; return json({ id, ...rest, sceneCount: Array.isArray(item.data.scenes) ? item.data.scenes.length : 0 }); }
  if (format === 'srt' && !item.data.subtitles) return json({ error: '이 영상에는 자막이 없습니다.' }, 404);
  const lang = item.data.lang === 'eng' ? 'eng' : 'kor';
  try {
    const b = await readFile(path.join(videoPath(u.id, id), format === 'srt' ? 'subtitles.srt' : 'video.mp4'));
    return new NextResponse(new Uint8Array(b), { headers: { 'Content-Type': format === 'srt' ? 'application/x-subrip; charset=utf-8' : 'video/mp4', 'Content-Disposition': format === 'srt' ? `attachment; filename="cora-subtitles.${lang}.srt"` : 'attachment; filename="cora-reel.mp4"', 'Cache-Control': 'private, no-store' } });
  } catch { return json({ error: '영상 파일이 없습니다.' }, 404); }
}
